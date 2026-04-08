import logging
import json
import datetime
import os
import aiohttp

BACKEND_URL = "http://127.0.0.1:8000/api/runs"

class UIClient:
    def __init__(self, run_id, archive_dir):
        self.run_id = run_id
        self.archive_dir = archive_dir
        self.log_filepath = os.path.join(archive_dir, "agent_log.jsonl")

    async def log(self, message, level="INFO"):
        """Logs to local file AND sends to backend asynchronously."""
        log_entry = {"timestamp": datetime.datetime.now().isoformat(), "level": level, "message": message}
        try:
            with open(self.log_filepath, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + "\n")
        except Exception:
            pass
        await self._send("log", log_entry)

    async def send_screenshot(self, base64_string):
        await self._send("screenshot", {"screenshot": base64_string})

    async def send_thought(self, thought_text, action_json):
        if isinstance(action_json, dict):
            action_json = json.dumps(action_json, indent=2)
        await self._send("thought", {"thought": thought_text, "action_json": action_json})

    async def send_artifact(self, filename, content, label="File Generated"):
        """Sends a file artifact to the UI with preview content."""
        payload = {
            "type": "file_artifact",
            "filename": filename,
            "label": label,
            "preview": content[:2000],
            "download_url": f"/api/runs/{self.run_id}/files/{filename}"
        }
        await self._send("artifact", payload)

    async def send_completion_status(self, status, duration=None):
        payload = {
            "status": status,
            "duration": duration
        }
        await self._send("completion", payload)

    async def _send(self, endpoint, payload):
        """Asynchronously sends data to the backend using aiohttp to avoid blocking."""
        url = f"{BACKEND_URL}/{self.run_id}/{endpoint}"
        try:
            async with aiohttp.ClientSession() as session:
                timeout = aiohttp.ClientTimeout(total=2)
                async with session.post(url, json=payload, timeout=timeout) as response:
                    if response.status >= 300:
                        logging.warning(f"UIClient failed to send to endpoint '{endpoint}' with status {response.status}")
        except Exception as e:
            logging.warning(f"UIClient exception sending to '{endpoint}': {e}")