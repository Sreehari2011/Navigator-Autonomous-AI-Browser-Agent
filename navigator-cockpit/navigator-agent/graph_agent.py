import json
import logging
import base64
from typing import TypedDict, List, Dict, Any, Optional
import asyncio
import os
import time

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langchain_core.runnables import RunnableConfig
import aiosqlite

from perception_engine import get_accessibility_tree
from tools import (
    navigate_to_url, click_element, type_element, scroll_page, hover_element, press_key, 
    go_back, refresh_page, select_option, extract_content, file_upload, execute_script, get_url
)
from memory_manager import MemoryManager
from session_memory import SessionMemory
from lib.ollama_utils import generate_json_with_ollama, query_ollama
from config import MODEL_PLANNER, MODEL_EXECUTOR

# ============================================================================
# STATE DEFINITION (ReAct Architecture)
# ============================================================================
class AgentState(TypedDict):
    """
    State definition for the ReAct Loop.
    Tracks the goal, current perception, and the history of actions (scratchpad).
    """
    goal: str
    credentials: Optional[Dict[str, str]]
    
    elements: List[dict]
    page_context: Dict[str, Any]
    
    scratchpad: List[Dict[str, Any]]
    
    latest_action: Optional[Dict[str, Any]]
    latest_observation: Optional[str]
    
    loop_count: int

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================
def format_elements_for_llm(elements: List[Dict]) -> str:
    """Formats the accessibility tree for prompts."""
    if not elements:
        return "No interactive elements were found on the page."
    formatted_elements = []
    for el in elements:
        role = el.get('role', 'element').upper()
        name = el.get('name', 'Unlabeled')
        state = el.get('state', '')
        entry = f"- {role}: \"{name}\""
        if state:
            entry += f" [{state}]"
        formatted_elements.append(entry)
    return "\n".join(formatted_elements)

def format_scratchpad(scratchpad: List[Dict]) -> str:
    """Formats the history of actions for the LLM context."""
    if not scratchpad:
        return "No actions taken yet."
    
    history_text = ""
    for i, step in enumerate(scratchpad):
        history_text += f"STEP {i+1}:\n"
        history_text += f"  Thought: {step.get('thought', 'N/A')}\n"
        history_text += f"  Action: {step.get('action_type')} -> {json.dumps(step.get('action_params'))}\n"
        history_text += f"  Observation: {step.get('observation', 'Pending...')}\n\n"
    return history_text

# ============================================================================
# NODES
# ============================================================================

async def perception_node(state: AgentState, config: RunnableConfig):
    """
    Scans the page to update the Agent's understanding of the world.
    """
    page = config["configurable"]["page"]
    ui_bridge = config["configurable"]["ui_bridge"]
    
    logging.info("PERCEPTION: Analyzing page semantics...")
    
    # 1. Get Semantic Tree
    semantic_elements = await get_accessibility_tree(page)

    # 2. Get Page Context
    page_context = {
        "url": page.url,
        "title": await page.title(),
        "interactive_count": len(semantic_elements)
    }

    # 3. Visual Debugging (Screenshot)
    try:
        screenshot_bytes = await page.screenshot(type="jpeg", quality=50)
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode()
        if ui_bridge:
            await ui_bridge.send_screenshot(screenshot_b64)
            
        # # Save locally for debugging
        # debug_dir = "debug_screenshots"
        # if not os.path.exists(debug_dir): os.makedirs(debug_dir)
        # timestamp = int(time.time())
        # with open(f"{debug_dir}/step_{timestamp}.jpg", "wb") as f:
        #     f.write(base64.b64decode(screenshot_b64))
            
    except Exception as e:
        logging.warning(f"Screenshot failed: {e}")

    return {
        "elements": semantic_elements,
        "page_context": page_context,
        "loop_count": state.get("loop_count", 0)
    }

async def orchestrator_node(state: AgentState, config: RunnableConfig):
    """
    The Brain (ReAct Core). Decides the next action based on Goal + History + Perception.
    """
    ui_bridge = config["configurable"].get("ui_bridge")
    
    goal = state["goal"]
    scratchpad_str = format_scratchpad(state.get("scratchpad", []))
    elements_str = format_elements_for_llm(state["elements"])
    current_url = state["page_context"].get("url", "Unknown")
    
    # Credentials block
    creds_str = ""
    if state.get("credentials"):
        creds_str = f"\nCREDENTIALS AVAILABLE: {json.dumps(state['credentials'])}\n"

    orchestrator_prompt = f"""
    You are an autonomous browser agent. You are executing a task in a ReAct (Reason -> Act) loop.
    
    ### GOAL
    {goal}
    
    ### CURRENT STATE
    - URL: {current_url}
    {creds_str}
    
    ### VISIBLE ELEMENTS (Accessibility Tree)
    {elements_str}
    
    ### HISTORY (Previous Actions & Observations)
    {scratchpad_str}
    
    ### AVAILABLE TOOLS
    - `navigate`: Go to a URL. Params: {{"url": "https://..."}}
    - `get_url`: Get the current page URL. Params: {{}}
    - `click`: Click an element. Params: {{"role": "...", "name": "..."}}
    - `type`: Type text. Params: {{"role": "...", "name": "...", "value": "text"}}
    - `select_option`: Dropdown. Params: {{"role": "...", "name": "...", "value": "option"}}
    - `hover`: Hover element. Params: {{"role": "...", "name": "..."}}
    - `scroll`: Scroll page. Params: {{"direction": "down/up/top/bottom"}}
    - `press_key`: Press key. Params: {{"key": "Enter/Escape"}}
    - `go_back`: Browser back button. Params: {{}}
    - `extract_content`: Scrape text. Params: {{"role": "...", "name": "..."}} (Leave params null to scrape whole page)
    - `finish`: Task Complete. Params: {{"reason": "..."}}
    
    ### INSTRUCTIONS
    1. **Analyze the History:** Look at the last Observation. Did the previous action succeed? If not, try a different approach (e.g., fallback from 'role' to 'text' search, or use a different tool).
    2. **Direct Navigation:** If the goal is to go to a specific site and you aren't there, use `navigate`.
    3. **Reasoning:** Explain *why* you are choosing the next action.
    4. **Finish:** Only call `finish` when you have verified the goal is met based on the Observations.

    ### OUTPUT FORMAT (JSON ONLY)
    {{
      "thought": "I see the search bar. I need to type the query.",
      "action": "type",
      "params": {{
        "role": "textbox",
        "name": "Search",
        "value": "Amazon anti-bot"
      }}
    }}
    """
    
    if ui_bridge:
        await ui_bridge.log(f"🧠 [ORCHESTRATOR THINKING]...\nContext: {current_url}")

    response = generate_json_with_ollama(orchestrator_prompt, model=MODEL_PLANNER)
    
    if not response:
        response = {"thought": "LLM failed to respond. Retrying perception.", "action": "refresh", "params": {}}

    if ui_bridge:
        await ui_bridge.send_thought(response.get("thought"), json.dumps(response, indent=2))

    return {
        "latest_action": {
            "thought": response.get("thought"),
            "action_type": response.get("action"),
            "action_params": response.get("params", {})
        }
    }

async def action_node(state: AgentState, config: RunnableConfig):
    """
    Executes the chosen tool and records the Observation.
    """
    page = config["configurable"]["page"]
    action_data = state["latest_action"]
    
    action_type = action_data["action_type"]
    params = action_data["action_params"]
    
    logging.info(f"🎬 ACTION: {action_type} | Params: {params}")
    
    observation = ""

    ui_bridge = config["configurable"].get("ui_bridge")
    archive_dir = config["configurable"].get("archive_dir", ".")
    
    try:
        # --- TOOL DISPATCHER ---
        if action_type == "navigate":
            observation = await navigate_to_url(page, params.get("url") or params.get("value"))

        elif action_type == "get_url":
            observation = await get_url(page)
        
        elif action_type == "click":
            observation = await click_element(page, params)
            
        elif action_type == "type":
            observation = await type_element(page, params)
            
        elif action_type == "hover":
            observation = await hover_element(page, params)
            
        elif action_type == "scroll":
            observation = await scroll_page(page, params.get("direction", "down"))
            
        elif action_type == "press_key":
            observation = await press_key(page, params.get("key", "Enter"))
            
        elif action_type == "go_back":
            observation = await go_back(page)
            
        elif action_type == "refresh":
            observation = await refresh_page(page)
            
        elif action_type == "select_option":
            observation = await select_option(page, params)
            
        elif action_type == "extract_content" or action_type == "extract":
            observation = await extract_content(page, params)

            if "PAGE CONTENT:" in observation or "EXTRACTED" in observation:
                # 1. Clean content
                clean_content = observation.replace("PAGE CONTENT:", "").replace("EXTRACTED:", "").strip()
                
                # 2. Save to file
                timestamp = int(time.time())
                filename = f"scraped_data_{timestamp}.txt"
                filepath = os.path.join(archive_dir, filename)
                
                try:
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(clean_content)
                    
                    # 3. SEND ARTIFACT TO UI
                    if ui_bridge:
                        await ui_bridge.send_artifact(
                            filename=filename,
                            content=clean_content,
                            label="Extracted Data"
                        )
                    
                    observation += f"\n[SYSTEM: Data saved to {filename}]"
                except Exception as e:
                    logging.error(f"File save error: {e}")
            
        elif action_type == "upload":
            observation = await file_upload(page, params)
            
        elif action_type == "finish":
            observation = "Task Marked as Complete."
            
        else:
            observation = f"Error: Unknown action type '{action_type}'."
            
    except Exception as e:
        observation = f"System Error executing action: {str(e)}"
        logging.error(observation)

    # Update Scratchpad
    current_scratchpad = state.get("scratchpad", [])
    new_entry = {
        "thought": action_data["thought"],
        "action_type": action_type,
        "action_params": params,
        "observation": observation
    }
    
    # Log Observation to UI
    ui_bridge = config["configurable"].get("ui_bridge")
    if ui_bridge:
        await ui_bridge.log(f"👁️ [OBSERVATION]: {observation}")

    return {
        "scratchpad": current_scratchpad + [new_entry],
        "latest_observation": observation,
        "loop_count": state["loop_count"] + 1
    }

# ============================================================================
# ROUTING
# ============================================================================
def route_after_orchestrator(state: AgentState):
    """
    Decides whether to execute an action or finish.
    """
    action = state["latest_action"]["action_type"]
    
    if action == "finish":
        return "end"
    
    if state["loop_count"] > 1000:
        logging.warning("⚠️ Max loop count reached. Forcing termination.")
        return "end"
        
    return "execute_action"

# ============================================================================
# GRAPH CONSTRUCTION
# ============================================================================
async def build_agent_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("perception", perception_node)
    workflow.add_node("orchestrator", orchestrator_node)
    workflow.add_node("action_executor", action_node)

    workflow.set_entry_point("perception")

    workflow.add_edge("perception", "orchestrator")

    workflow.add_conditional_edges(
        "orchestrator",
        route_after_orchestrator,
        {
            "execute_action": "action_executor",
            "end": END
        }
    )

    workflow.add_edge("action_executor", "perception")

    conn = await aiosqlite.connect(":memory:")
    checkpoint_manager = AsyncSqliteSaver(conn=conn)
    
    return workflow, checkpoint_manager