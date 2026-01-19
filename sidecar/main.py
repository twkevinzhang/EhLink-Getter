import uvicorn
import json
import httpx
import sys
import os
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict

from src.services.eh_scraper_service import EhScraperService
from src.utilities.header_builder import build_headers
from src.entities.link_info import LinkInfo
from src.services.proxy_manager import ProxyManager
from src.services.download_manager import DownloadManager

app = FastAPI(title="EhLink-Getter Sidecar")

class Config(BaseModel):
    cookies: str = ""
    proxies: List[str] = []
    metadata_path: str = "metadata.json"
    download_path: str = "output"
    scan_thread_cnt: int = 3
    download_thread_cnt: int = 5

# Global state
config = Config()
proxy_manager = ProxyManager([])
download_manager = DownloadManager(config.download_path)

@app.post("/config")
async def update_config(new_config: Config):
    global config, proxy_manager, download_manager
    config = new_config
    proxy_manager = ProxyManager(config.proxies)
    download_manager = DownloadManager(config.download_path, config.download_thread_cnt)
    return {"status": "updated", "config": config}

@app.post("/job/start")
async def start_job(job_id: str, images: List[Dict], background_tasks: BackgroundTasks):
    client_args = proxy_manager.get_client_args()
    background_tasks.add_task(download_manager.start_job, job_id, images, client_args)
    return {"status": "started", "job_id": job_id}

@app.get("/job/status/{job_id}")
async def get_job_status(job_id: str):
    status = download_manager.get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status

@app.get("/tasks/fetch")
async def fetch_page_with_token(url: str, next: Optional[str] = None):
    headers = build_headers(config.cookies)
    service = EhScraperService(headers)
    client_args = proxy_manager.get_client_args()
    async with httpx.AsyncClient(**client_args, timeout=30) as client:
        result = await service.fetch_page_with_token(client, url=url, next_token=next)
        return {
            "items": [item.dict() for item in result["items"]],
            "next": result["next"]
        }

@app.post("/tasks/stop")
async def stop_task():
    # Placeholder for stop logic in V2
    return {"status": "not_implemented"}

if __name__ == "__main__":
    # Default port 8000
    port = int(os.environ.get("SIDECAR_PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)
