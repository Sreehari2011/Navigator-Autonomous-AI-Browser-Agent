import logging
import os
import json
import time
from graph_agent import build_agent_graph
from session_memory import SessionMemory
from memory_manager import MemoryManager
from typing import TypedDict, List, Dict, Any, Optional
import aiosqlite

def is_alive_patch(self): return True
if not hasattr(aiosqlite.Connection, "is_alive"): setattr(aiosqlite.Connection, "is_alive", is_alive_patch)

class AgentState(TypedDict):
    goal: str
    credentials: Optional[Dict[str, str]]
    elements: List[dict]
    page_context: Dict[str, Any]
    scratchpad: List[Dict[str, Any]]
    latest_action: Optional[Dict[str, Any]]
    latest_observation: Optional[str]
    loop_count: int

class AgentExecutor:
    """ReAct Loop Orchestrator"""

    def __init__(self, browser_manager, run_id, archive_dir, ui_bridge):
        self.browser_mgr = browser_manager
        self.page = browser_manager.page
        self.run_id = run_id
        self.archive_dir = archive_dir
        self.ui_bridge = ui_bridge
        self.final_scratchpad = []
        self.recursion_limit = 150

    async def start_goal_oriented_task(self, objective: str, credentials: Optional[Dict[str, str]] = None):
        """Starts the ReAct Loop"""
        logging.info("--- AGENT: Starting ReAct Loop ---")
        start_time = time.time()
        logging.info(f"OBJECTIVE: {objective}")

        workflow, checkpoint_manager = await build_agent_graph()
        
        # Dependencies
        long_term_memory = MemoryManager()
        session_memory = SessionMemory()

        # Initial State
        initial_state = {
            "goal": objective,
            "credentials": credentials,
            "elements": [],
            "page_context": {},
            "scratchpad": [],
            "latest_action": None,
            "latest_observation": None,
            "loop_count": 0
        }

        config = {
            "configurable": {
                "thread_id": self.run_id,
                "page": self.page,
                "ui_bridge": self.ui_bridge,
                "browser_mgr": self.browser_mgr,
                "memory_manager": long_term_memory,
                "session_memory": session_memory,
                "archive_dir": self.archive_dir
            },
            "recursion_limit": self.recursion_limit
        }

        # Run Graph
        app = workflow.compile(checkpointer=checkpoint_manager)
        
        async for output in app.astream(initial_state, config):
            for node_name, state_update in output.items():
                logging.info(f"[GRAPH] Executed: {node_name.upper()}")
                
                # Capture the evolving history
                if "scratchpad" in state_update:
                    self.final_scratchpad = state_update["scratchpad"]

        end_time = time.time()
        duration = end_time - start_time 
        
        # Final Reporting
        await self._write_final_reports()
        await self.ui_bridge.send_completion_status("COMPLETED", duration=duration)
        logging.info(f"--- TASK FINISHED ({len(self.final_scratchpad)} steps) ---")

    async def _write_final_reports(self):
        """Save the execution trace (scratchpad) as a JSON report."""
        logging.info("Saving execution trace...")
        
        json_path = os.path.join(self.archive_dir, "execution_trace.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(self.final_scratchpad, f, indent=2)
        
        logging.info(f"Trace saved to {json_path}")