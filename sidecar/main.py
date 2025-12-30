import uvicorn
import json
import httpx
import sys
import os
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from src.services.eh_scraper_service import EhScraperService
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

class SaveRequest(BaseModel):
    path: str
    results: List[LinkInfo]

@app.post("/tasks/save")
async def save_task(req: SaveRequest):
    service = EhScraperService(build_headers(config.cookies))
    try:
        import datetime
        now = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        actual_path = req.path.replace("{execute_started_at}", now)
        
        service.save_to_csv(actual_path, results=req.results)
        log_event("log", {"level": "info", "message": f"Results manually saved to {actual_path}"})
        return {"status": "saved", "path": actual_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tasks/stop")
async def stop_task():
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
