import os
import sys
import json
import logging
import argparse
import asyncio
import datetime

current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)

if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from browser_manager import BrowserManager
from agent_executor import AgentExecutor
from ui_client import UIClient

main_loop = None

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_object = {
            "timestamp": datetime.datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "message": record.getMessage()
        }
        return json.dumps(log_object)

class UIHandler(logging.Handler):
    def __init__(self, ui_client):
        super().__init__()
        self.ui_client = ui_client

    def emit(self, record):
        global main_loop
        try:
            msg = self.format(record)
            log_entry = {
                "timestamp": datetime.datetime.fromtimestamp(record.created).isoformat(),
                "level": record.levelname,
                "message": msg
            }
            if main_loop and main_loop.is_running():
                main_loop.call_soon_threadsafe(
                    lambda: asyncio.create_task(self.ui_client._send("log", log_entry))
                )
        except Exception:
            self.handleError(record)

def setup_logging(run_id, archive_dir, ui_client):
    log_filepath = os.path.join(archive_dir, "agent_log.jsonl")
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)
    
    file_handler = logging.FileHandler(log_filepath)
    file_handler.setFormatter(JsonFormatter())
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter('%(message)s'))

    ui_handler = UIHandler(ui_client)
    ui_handler.setFormatter(logging.Formatter('%(message)s'))
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        handlers=[file_handler, console_handler, ui_handler]
    )

async def main():
    global main_loop
    main_loop = asyncio.get_running_loop()

    parser = argparse.ArgumentParser(description="Navigator General Purpose Browser Agent")

    parser.add_argument("--run-id", required=True, help="Unique run ID")
    parser.add_argument("--url", required=True, help="The starting URL")
    
    # Arguments sent by Backend
    parser.add_argument("--mode", required=True, choices=['explore', 'goal'], help="Execution mode")
    parser.add_argument("--objective", help="Task for the agent")
    parser.add_argument("--username", help="Username for login")
    parser.add_argument("--password", help="Password for login")
    
    parser.add_argument("--credentials", help="JSON string for credentials")
    
    parser.add_argument("--llm-model", help="Executor Model Name")
    parser.add_argument("--planner-model", help="Planner Model Name")
    parser.add_argument("--base-url", help="LLM Base URL")
    parser.add_argument("--api-key", help="LLM API Key")
    parser.add_argument("--recursion-limit", type=int, default=150, help="Recursion Limit")
    parser.add_argument("--json-retries", type=int, default=3, help="JSON Retry Limit")
    parser.add_argument("--headless", type=str, default="false", help="Headless Mode (true/false)")

    args = parser.parse_args()

    # Setup archive directory
    run_archive_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "run_archives", args.run_id)
    os.makedirs(run_archive_dir, exist_ok=True)

    # Initialize UIClient and Logging
    ui_client = UIClient(args.run_id, run_archive_dir)
    setup_logging(args.run_id, run_archive_dir, ui_client)

    import config as agent_config
    if args.llm_model: agent_config.MODEL_EXECUTOR = args.llm_model
    if args.planner_model: agent_config.MODEL_PLANNER = args.planner_model
    
    import lib.ollama_utils as ollama_utils
    if args.base_url: ollama_utils.base_url = args.base_url
    if args.api_key: ollama_utils.api_key = args.api_key

    # Consolidate Credentials
    credentials = {}
    if args.credentials:
        try:
            credentials = json.loads(args.credentials)
        except: pass
    
    # If backend provided individual username/password, they take precedence
    if args.username: credentials["username"] = args.username
    if args.password: credentials["password"] = args.password

    objective = args.objective if args.objective else "Explore the website and identify interactive features."

    await ui_client.log(f"--- Navigator Browser Agent Starting (Mode: {args.mode}) ---")
    
    logging.info(f"STARTING URL FROM ARGS: {args.url}")

    browser_mgr = None
    try:
        browser_mgr = BrowserManager()

        is_headless = args.headless.lower() == 'true'
        page = await browser_mgr.start(headless=is_headless)

        browser_mgr.start_tracing(ui_client)
        
        logging.info(f"Navigating to: {args.url}")
        await page.goto(args.url, wait_until='networkidle')
        await ui_client.log(f"Navigation complete. Starting Goal: {objective}")

        executor = AgentExecutor(browser_mgr, args.run_id, run_archive_dir, ui_client)
        executor.recursion_limit = args.recursion_limit
        await executor.start_goal_oriented_task(objective, credentials)

        await ui_client.log("--- Workflow Complete ---")

    except Exception as e:
        logging.error(f"Critical error: {e}")
        if ui_client:
            await ui_client.log(f"Critical Error: {e}", level="ERROR")
    finally:
        if browser_mgr:
            await browser_mgr.stop()
        logging.info("--- Agent Stopped ---")

if __name__ == "__main__":
    asyncio.run(main())