import uvicorn
import json
import httpx
import sys
import os
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from src.services.eh_scraper_service import EhScraperService
from src.utilities.header_builder import build_headers
from src.entities.link_info import LinkInfo

app = FastAPI(title="EhLink-Getter Sidecar")

class Config(BaseModel):
    cookies: str = ""
    proxy: Optional[str] = None
    metadata_path: str = "metadata.json"
    download_path: str = "output"

# Global state
config = Config()
current_service: Optional[EhScraperService] = None

def log_event(event_type: str, data: dict):
    """Output structured JSON to stdout for Electron to consume"""
    print(json.dumps({"type": event_type, **data}), flush=True)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/config")
async def update_config(new_config: Config):
    global config
    config = new_config
    return {"status": "updated", "config": config}

@app.get("/tasks/fetch")
async def fetch_page_with_token(url: str, next: Optional[str] = None):
    headers = build_headers(config.cookies)
    service = EhScraperService(headers)
    async with httpx.AsyncClient(timeout=30) as client:
        result = await service.fetch_page_with_token(client, url=url, next_token=next)
        return {
            "items": [item.dict() for item in result["items"]],
            "next": result["next"]
        }

@app.post("/tasks/stop")
async def stop_task():
    global current_service
    if current_service:
        current_service.cancel()
        log_event("log", {"level": "warn", "message": "Task termination requested by user."})
        return {"status": "stopping"}
    return {"status": "no_active_task"}

if __name__ == "__main__":
    # Default port 8000
    port = int(os.environ.get("SIDECAR_PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)
