import asyncio
import httpx
from bs4 import BeautifulSoup
from typing import List, Callable
from ..entities.link_info import LinkInfo

class EhFavoriteService:
    def __init__(self, headers: dict):
        self.headers = headers
        self.results = []

    async def get_latest_page(self, client: httpx.AsyncClient) -> int:
        response = await client.get("https://e-hentai.org/favorites.php", headers=self.headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        nav = soup.select("table.ptt td")
        if not nav or len(nav) < 2:
            return 1
        return int(nav[len(nav) - 2].text)

    async def fetch_page(self, client: httpx.AsyncClient, page: int, progress_callback: Callable = None):
        url = f"https://e-hentai.org/favorites.php?page={page}"
        try:
            response = await client.get(url, headers=self.headers)
            soup = BeautifulSoup(response.text, 'html.parser')
            items = self.parse_list(soup)
            self.results.extend(items)
            if progress_callback:
                progress_callback(page, items)
        except Exception as e:
            print(f"Error fetching page {page}: {e}")

    def parse_list(self, soup: BeautifulSoup) -> List[LinkInfo]:
        return [
            LinkInfo(
                title=title_element.text,
                link=title_element.parent.get("href")
            )
            for title_element in soup.select("table.itg.gltm div.glink")
        ]

    async def scrapy(self, progress_callback: Callable = None):
        async with httpx.AsyncClient() as client:
            total_pages = await self.get_latest_page(client)
            tasks = []
            for page in range(total_pages):
                tasks.append(self.fetch_page(client, page, progress_callback))
            
            # Using semaphore to limit concurrency
            sem = asyncio.Semaphore(5)
            async def sem_task(task):
                async with sem:
                    return await task
            
            await asyncio.gather(*(sem_task(t) for t in tasks))
        
        return self.results
