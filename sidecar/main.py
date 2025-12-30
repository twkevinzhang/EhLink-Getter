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

class MetadataMapRequest(BaseModel):
    keywords: List[str]
    metadata_path: str
    fields: List[str]

# Global state
config = Config()
current_service: Optional[EhFavoriteService] = None

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
async def start_favorites_task(background_tasks: BackgroundTasks, output_path: Optional[str] = None):
    global current_service
    headers = build_headers(config.cookies)
    current_service = EhFavoriteService(headers)
    
    async def run_task():
        log_event("log", {"level": "info", "message": "Starting favorites download task..."})
        try:
            def progress_cb(page, items):
                log_event("progress", {
                    "message": f"Fetched page {page}",
                    "items_count": len(items)
                })
            
            results = await current_service.scrapy(progress_callback=progress_cb)
            
            if output_path:
                actual_path = output_path
                import datetime
                now = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                actual_path = actual_path.replace("{execute_started_at}", now)
                
                current_service.save_to_csv(actual_path)
                log_event("log", {"level": "info", "message": f"Results saved to {actual_path}"})

            log_event("task_complete", {
                "task": "favorites",
                "count": len(results),
                "results": [r.dict() for r in results]
            })
        except Exception as e:
            log_event("log", {"level": "error", "message": str(e)})
        finally:
            pass # Keep service for a bit if needed, or clear it

    background_tasks.add_task(run_task)
    return {"status": "task_started"}

@app.post("/tasks/favorites/stop")
async def stop_favorites_task():
    global current_service
    if current_service:
        current_service.cancel()
        log_event("log", {"level": "warn", "message": "Task termination requested by user."})
        return {"status": "stopping"}
    return {"status": "no_active_task"}

@app.post("/tasks/metadata/map")
async def map_metadata(req: MetadataMapRequest):
    log_event("log", {"level": "info", "message": f"Mapping metadata for {len(req.keywords)} keywords..."})
    service = MetadataService(req.metadata_path)
    try:
        import anyio
        # Run synchronous file I/O in a separate thread to avoid blocking the event loop
        raw_results = await anyio.to_thread.run_sync(
            service.find_multiple_links, 
            req.keywords, 
            1000, 
            True
        )
        
        filtered_results = []
        for item in raw_results:
            item_filtered = {}
            for f in req.fields:
                if f == "link":
                    item_filtered["link"] = f'https://e-hentai.org/g/{item["gid"]}/{item["token"]}/'
                elif f in item:
                    item_filtered[f] = item[f]
            filtered_results.append(item_filtered)
            
        log_event("log", {"level": "info", "message": f"Filtered {len(filtered_results)} results for metadata mapping."})
        return {"results": filtered_results}
    except Exception as e:
        log_event("log", {"level": "error", "message": f"Metadata mapping error: {str(e)}"})
        raise HTTPException(status_code=500, detail=str(e))

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
