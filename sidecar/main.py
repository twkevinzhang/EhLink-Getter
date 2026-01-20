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

@app.get("/health")
async def health_check():
    """Health check endpoint to verify sidecar status"""
    return {"status": "ok"}

@app.post("/config")
async def update_config(new_config: Config):
    """Update configuration - stateless, only stores config for current session"""
    global config, proxy_manager
    config = new_config
    proxy_manager = ProxyManager(config.proxies)
    return {"status": "updated", "config": config}

@app.get("/image/fetch")
async def fetch_image(url: str):
    """Fetch image bytes from URL. If it's an image page (/s/), resolve the real image first."""
    headers = build_headers(config.cookies)
    client_args = proxy_manager.get_client_args()
    
    async with httpx.AsyncClient(**client_args, timeout=30) as client:
        try:
            target_url = url
            
            # Smart Resolver: If it's an image page, parse the real image URL
            if "/s/" in url:
                from src.utilities.parsers import ImageParser
                page_resp = await client.get(url, headers=headers, follow_redirects=True)
                page_resp.raise_for_status()
                real_img_url = ImageParser.parse_image_page(page_resp.text)
                if real_img_url:
                    target_url = real_img_url
            
            response = await client.get(target_url, headers=headers, follow_redirects=True)
            response.raise_for_status()
            
            from fastapi.responses import Response
            return Response(content=response.content, media_type=response.headers.get("content-type", "image/jpeg"))
            
        except httpx.HTTPStatusError as e:
            error_detail = f"EH Image Fetch Error: {str(e)} for URL: {url}"
            print(error_detail)
            # Passthrough the original status code if it's 4xx
            status_code = e.response.status_code if 400 <= e.response.status_code < 500 else 500
            raise HTTPException(status_code=status_code, detail=error_detail)
        except Exception as e:
            error_detail = f"EH Image Fetch Error: {str(e)} for URL: {url}"
            print(error_detail)
            raise HTTPException(status_code=500, detail=error_detail)

@app.get("/gallery/metadata")
async def get_gallery_metadata(url: str):
    """Fetch gallery info and all its image pages."""
    headers = build_headers(config.cookies)
    service = EhScraperService(headers)
    client_args = proxy_manager.get_client_args()
    async with httpx.AsyncClient(**client_args, timeout=60) as client:
        try:
            result = await service.fetch_gallery_metadata(client, url)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

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
