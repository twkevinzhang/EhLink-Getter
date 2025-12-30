import uvicorn
import json
import sys
import os
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from src.services.eh_favorite_service import EhFavoriteService
from src.services.metadata_service import MetadataService
from src.utilities.header_builder import build_headers
from src.entities.link_info import LinkInfo

app = FastAPI(title="EhLink-Getter Sidecar")

class Config(BaseModel):
    cookies: str = ""
    proxy: Optional[str] = None
    metadata_path: str = "metadata.json"
    download_path: str = "output"

# Global state (simplified for now)
config = Config()

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

@app.post("/tasks/favorites")
async def start_favorites_task(background_tasks: BackgroundTasks):
    headers = build_headers(config.cookies)
    service = EhFavoriteService(headers)
    
    async def run_task():
        log_event("log", {"level": "info", "message": "Starting favorites download task..."})
        try:
            def progress_cb(page, items):
                log_event("progress", {
                    "message": f"Fetched page {page}",
                    "items_count": len(items)
                })
            
            results = await service.scrapy(progress_callback=progress_cb)
            log_event("task_complete", {
                "task": "favorites",
                "count": len(results),
                "results": [r.dict() for r in results]
            })
        except Exception as e:
            log_event("log", {"level": "error", "message": str(e)})

    background_tasks.add_task(run_task)
    return {"status": "task_started"}

@app.get("/search")
async def search_metadata(q: str):
    service = MetadataService(config.metadata_path)
    try:
        results = service.find_links(q)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Default port 8000
    port = int(os.environ.get("SIDECAR_PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)
