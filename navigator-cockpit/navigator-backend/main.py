import os
import json
import uuid
import time
import sys
import asyncio
import logging
import subprocess
import psutil
from typing import List, Dict
from pydantic import BaseModel
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

live_run_states: Dict[str, Dict] = {}
running_processes: Dict[str, subprocess.Popen] = {}

logging.basicConfig(level=logging.INFO)
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---
class Thought(BaseModel):
    thought: str
    action_json: str

class CompletionStatus(BaseModel):
    status: str
    duration: float | None = None

class RunConfig(BaseModel):
    url: str
    username: str
    password: str
    mode: str
    objective: str | None = None
    llm_model: str | None = None
    planner_model: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    recursion_limit: int | None = None
    json_retries: int | None = None
    headless: bool | None = None

# --- Connection Management ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, run_id: str, websocket: WebSocket):
        await websocket.accept()
        if run_id not in self.active_connections:
            self.active_connections[run_id] = []
        self.active_connections[run_id].append(websocket)

    def disconnect(self, run_id: str, websocket: WebSocket):
        if run_id in self.active_connections:
            self.active_connections[run_id].remove(websocket)

    async def broadcast(self, run_id: str, message: dict):
        if run_id in self.active_connections:
            for connection in self.active_connections[run_id]:
                await connection.send_json(message)

manager = ConnectionManager()

# --- API Endpoints ---

@app.post("/api/run")
async def start_agent_run(config: RunConfig):
    """
    Starts a new agent run (either explore or goal-oriented mode).
    """
    timestamp = int(time.time())
    unique_part = str(uuid.uuid4())
    run_id = f"{timestamp}_{unique_part}"
    logging.info(f"Starting new run with ID: {run_id}")
    logging.info(f"Mode: {config.mode}, URL: {config.url}")

    live_run_states[run_id] = {
        "interaction_graph": None,
        "logs": [],
        "thoughts": []
    }

    python_executable = sys.executable
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(backend_dir)
    
    agent_script_path = os.path.join(project_root, "navigator-agent", "main.py")
    
    if not os.path.exists(agent_script_path):
        logging.error(f"Agent script not found at: {agent_script_path}")
        return JSONResponse(
            status_code=500,
            content={"error": "Agent script not found", "path": agent_script_path}
        )
    
    logging.info(f"Agent script path: {agent_script_path}")
    
    command = [
        python_executable,
        agent_script_path,
        "--run-id", run_id,
        "--url", config.url,
        "--username", config.username,
        "--password", config.password,
        "--mode", config.mode,
    ]

    if config.llm_model: command.extend(["--llm-model", config.llm_model])
    if config.planner_model: command.extend(["--planner-model", config.planner_model])
    if config.base_url: command.extend(["--base-url", config.base_url])
    if config.api_key: command.extend(["--api-key", config.api_key])
    if config.recursion_limit: command.extend(["--recursion-limit", str(config.recursion_limit)])
    if config.json_retries: command.extend(["--json-retries", str(config.json_retries)])
    if config.headless is not None: command.extend(["--headless", str(config.headless).lower()])

    if config.mode == 'goal' and config.objective:
        command.extend(["--objective", config.objective])
        creds_json = json.dumps({"username": config.username, "password": config.password})
        command.extend(["--credentials", creds_json])

    agent_working_dir = os.path.dirname(agent_script_path)
    
    try:
        process = subprocess.Popen(
            command,
            cwd=agent_working_dir
        )
        running_processes[run_id] = process
        logging.info(f"Agent process started with PID: {process.pid}")
        
        return {
            "run_id": run_id,
            "message": "Agent run started successfully.",
            "mode": config.mode,
            "objective": config.objective if config.mode == 'goal' else None
        }
    except Exception as e:
        logging.error(f"Failed to start agent process: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to start agent: {str(e)}"}
        )

@app.post("/api/run/{run_id}/stop")
async def stop_agent_run(run_id: str):
    """Stops a running agent process"""
    logging.info(f"Attempting to stop run: {run_id}")
    if run_id in running_processes:
        process = running_processes[run_id]
        try:
            parent = psutil.Process(process.pid)
            for child in parent.children(recursive=True):
                child.kill()
            parent.kill()
            del running_processes[run_id]
            if run_id in live_run_states:
                del live_run_states[run_id]
            return {"message": f"Stop signal sent to run {run_id}."}
        except psutil.NoSuchProcess:
            return {"message": "Process was already finished."}
    return JSONResponse(status_code=404, content={"message": "No active run found."})

@app.post("/api/runs/{run_id}/log")
async def receive_agent_log(run_id: str, request: Request):
    """Receives log messages from the agent"""
    log_data = await request.json()
    if run_id in live_run_states:
        live_run_states[run_id]["logs"].append(log_data)
    await manager.broadcast(run_id, {"type": "log", "payload": log_data})
    return {"status": "log received"}

@app.post("/api/runs/{run_id}/graph")
async def receive_interaction_graph(run_id: str, request: Request):
    """Receives interaction graph from the agent"""
    graph_data = await request.json()
    if run_id in live_run_states:
        live_run_states[run_id]["interaction_graph"] = graph_data
    await manager.broadcast(run_id, {"type": "interaction_graph", "payload": graph_data})
    return {"status": "graph received"}

@app.post("/api/runs/{run_id}/screenshot")
async def receive_agent_screenshot(run_id: str, request: Request):
    """Receives screenshot from the agent"""
    screenshot_data = await request.json()
    await manager.broadcast(run_id, {"type": "screenshot", "payload": screenshot_data})
    return {"status": "screenshot received"}

@app.post("/api/runs/{run_id}/thought")
async def receive_agent_thought(run_id: str, thought: Thought):
    """Receives reasoning/thought from the agent"""
    thought_data = thought.dict()
    if run_id in live_run_states:
        live_run_states[run_id]["thoughts"].append(thought_data)
    
    await manager.broadcast(run_id, {"type": "agent_thought", "payload": thought_data})
    return {"status": "thought received"}

@app.post("/api/runs/{run_id}/completion")
async def receive_completion_status(run_id: str, completion: CompletionStatus):
    """Receives completion status from agent"""
    status = completion.status
    duration = completion.duration
    logging.info(f"Run {run_id} completed: {status} in {duration}s")
    await manager.broadcast(run_id, {
        "type": "completion", 
        "payload": {"status": status, "duration": duration}
    })
    return {"status": "completion received"}

@app.websocket("/ws/runs/{run_id}")
async def websocket_endpoint(websocket: WebSocket, run_id: str):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(run_id, websocket)
    try:
        while True:
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        manager.disconnect(run_id, websocket)

ARCHIVE_BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "navigator-agent", "run_archives")

@app.get("/api/runs/{run_id}/files/{filename}")
async def download_run_file(run_id: str, filename: str):
    """Allows downloading generated files (like scraped_data.txt)"""
    
    base_path = os.path.join(os.path.dirname(__file__), "..", "navigator-agent", "run_archives")
    file_path = os.path.join(base_path, run_id, filename)
    
    if not os.path.exists(file_path):
        return JSONResponse(status_code=404, content={"error": "File not found"})
        
    return FileResponse(
        path=file_path, 
        filename=filename, 
        media_type='text/plain'
    )

@app.post("/api/runs/{run_id}/artifact")
async def receive_artifact(run_id: str, request: Request):
    """Receives file artifact details"""
    data = await request.json()
    # Broadcast to frontend via WebSocket
    await manager.broadcast(run_id, {"type": "artifact", "payload": data})
    return {"status": "received"}

# ============================================================================
# HEALTH CHECK
# ============================================================================
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "active_runs": len(running_processes),
        "timestamp": time.time()
    }