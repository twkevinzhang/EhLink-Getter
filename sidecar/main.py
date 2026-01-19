import uvicorn
import httpx
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from src.services.eh_scraper_service import EhScraperService
from src.utilities.header_builder import build_headers
from src.services.proxy_manager import ProxyManager

app = FastAPI(title="EhLink-Getter Sidecar")

class Config(BaseModel):
    cookies: str = ""
    proxies: List[str] = []
    metadata_path: str = "metadata.json"
    download_path: str = "output"
    scan_thread_cnt: int = 3
    download_thread_cnt: int = 5

# Global configuration (stateless)
config = Config()
proxy_manager = ProxyManager([])

@app.post("/config")
async def update_config(new_config: Config):
    """Update configuration - stateless, only stores config for current session"""
    global config, proxy_manager
    config = new_config
    proxy_manager = ProxyManager(config.proxies)
    return {"status": "updated", "config": config}

@app.get("/tasks/fetch")
async def fetch_page_with_token(url: str, next: Optional[str] = None):
    """Stateless page fetching - returns single page result"""
    headers = build_headers(config.cookies)
    service = EhScraperService(headers)
    client_args = proxy_manager.get_client_args()
    async with httpx.AsyncClient(**client_args, timeout=30) as client:
        result = await service.fetch_page_with_token(client, url=url, next_token=next)
        return {
            "items": [item.dict() for item in result["items"]],
            "next": result["next"]
        }

if __name__ == "__main__":
    # Default port 8000
    port = int(os.environ.get("SIDECAR_PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)
