import asyncio
import aiofiles
import httpx
import os
from typing import Dict, List, Optional, Callable
import json

class DownloadManager:
    def __init__(self, download_path: str, concurrency: int = 5):
        self.download_path = download_path
        self.semaphore = asyncio.Semaphore(concurrency)
        self.active_jobs: Dict[str, Dict] = {}

    async def download_image(self, client: httpx.AsyncClient, url: str, target_path: str, job_id: str):
        async with self.semaphore:
            try:
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                async with client.stream("GET", url) as response:
                    response.raise_for_status()
                    async with aiofiles.open(target_path, mode='wb') as f:
                        async for chunk in response.aiter_bytes():
                            await f.write(chunk)
                
                # Update job status (simplified)
                if job_id in self.active_jobs:
                    self.active_jobs[job_id]["completed_count"] += 1
            except Exception as e:
                print(f"Error downloading {url}: {e}")

    async def start_job(self, job_id: str, images: List[Dict], client_args: dict):
        self.active_jobs[job_id] = {
            "status": "running",
            "total_count": len(images),
            "completed_count": 0,
            "images": images
        }
        
        async with httpx.AsyncClient(**client_args, timeout=60) as client:
            tasks = []
            for img in images:
                target = os.path.join(self.download_path, img["filename"])
                tasks.append(self.download_image(client, img["url"], target, job_id))
            
            await asyncio.gather(*tasks)
            self.active_jobs[job_id]["status"] = "completed"

    def get_job_status(self, job_id: str) -> Optional[Dict]:
        return self.active_jobs.get(job_id)
