"""
Session-scoped memory for storing runtime context during task execution.
Complements ChromaDB's long-term memory with ephemeral working memory.
"""

import logging
import hashlib
from typing import Dict, List, Any
from datetime import datetime

class SessionMemory:
    """
    Runtime memory that persists only during a single task execution.
    Stores UI instructions, extracted data, and contextual information.
    """
    
    def __init__(self):
        self.ui_instructions: List[str] = []
        self.extracted_data: Dict[str, Any] = {}
        self.page_states: List[Dict] = []
        self.error_messages: List[str] = []
        self.successful_patterns: List[Dict] = []
        self.last_action_failed_visual_check = False
        
    def add_ui_instruction(self, instruction: str):
        """
        Store UI instructions like 'Select Organization First' or 'Field Required'.
        """
        if instruction not in self.ui_instructions:
            self.ui_instructions.append(instruction)
            logging.info(f"SESSION MEMORY: Stored instruction - {instruction}")
    
    def add_extracted_data(self, key: str, value: Any):
        """
        Store extracted text or data that might be useful later.
        Example: Organization name, alert count, dashboard metrics
        """
        self.extracted_data[key] = {
            "value": value,
            "timestamp": datetime.now().isoformat()
        }
        logging.info(f"SESSION MEMORY: Stored data - {key}: {value}")
    
    def log_page_state(self, url: str, element_count: int, screenshot_hash: str):
        """
        Track visited pages to detect navigation and stalled states.
        """
        if self.page_states:
            last_state = self.page_states[-1]
            if last_state["screenshot_hash"] == screenshot_hash:
                self.last_action_failed_visual_check = True
                logging.warning("VISUAL STATE STALLED: Last action caused no visual change.")
            else:
                self.last_action_failed_visual_check = False
        
        state = {
            "url": url,
            "element_count": element_count,
            "screenshot_hash": screenshot_hash,
            "timestamp": datetime.now().isoformat()
        }
        self.page_states.append(state)
        
        if len(self.page_states) > 10:
            self.page_states.pop(0)
    
    def add_error_message(self, error: str):
        """Store error messages to help LLM understand what went wrong."""
        if error not in self.error_messages:
            self.error_messages.append(error)
            logging.warning(f"SESSION MEMORY: Stored error - {error}")
    
    def record_successful_pattern(self, action_sequence: List[Dict]):
        """
        Store successful multi-step patterns within this session.
        Example: [hover(menu) → click(submenu)] worked for dropdowns.
        """
        self.successful_patterns.append({
            "sequence": action_sequence,
            "timestamp": datetime.now().isoformat()
        })
        logging.info(f"SESSION MEMORY: Stored successful pattern with {len(action_sequence)} steps")
    
    def get_context_summary(self) -> str:
        """
        Generate a text summary of session memory for LLM context.
        This is injected into the reasoning prompt.
        """
        summary_parts = []

        if self.last_action_failed_visual_check:
            summary_parts.append(
                "!!! CRITICAL WARNING !!!\n"
                "Your last action resulted in NO VISUAL CHANGE to the page.\n"
                "- The button you clicked might be broken, unresponsive, or require prerequisites.\n"
                "- DO NOT assume the action succeeded.\n"
                "- DO NOT proceed to the next step. RETRY or fix inputs first."
            )
        
        if self.ui_instructions:
            summary_parts.append(f"UI INSTRUCTIONS SEEN:\n- " + "\n- ".join(self.ui_instructions[-3:]))
        
        if self.extracted_data:
            data_str = "\n- ".join([f"{k}: {v['value']}" for k, v in list(self.extracted_data.items())[-5:]])
            summary_parts.append(f"EXTRACTED DATA:\n- {data_str}")
        
        if self.error_messages:
            summary_parts.append(f"ERRORS ENCOUNTERED:\n- " + "\n- ".join(self.error_messages[-3:]))
        
        if self.successful_patterns:
            summary_parts.append(f"SUCCESSFUL PATTERNS THIS SESSION: {len(self.successful_patterns)} recorded")
        
        return "\n\n".join(summary_parts) if summary_parts else "No session context yet."
    
    def is_stuck_in_loop(self, current_page_hash: str, threshold: int = 3) -> bool:
        """
        Detect if agent is stuck by checking if same page state repeats.
        """
        if not self.page_states:
            return False
            
        recent_window = self.page_states[-10:]
        occurrence_count = sum(1 for s in recent_window if s["screenshot_hash"] == current_page_hash)
        return occurrence_count >= threshold
    
    def clear(self):
        """Reset memory for new task."""
        self.__init__()
        logging.info("SESSION MEMORY: Cleared")