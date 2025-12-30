import asyncio
import httpx
from bs4 import BeautifulSoup
from typing import List, Callable
from ..entities.link_info import LinkInfo

class EhFavoriteService:
    def __init__(self, headers: dict):
        self.headers = headers
        self.results = []
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    async def get_latest_page(self, client: httpx.AsyncClient) -> int:
        response = await client.get("https://e-hentai.org/favorites.php", headers=self.headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        nav = soup.select("table.ptt td")
        if not nav or len(nav) < 2:
            return 1
        return int(nav[len(nav) - 2].text)

    async def fetch_page(self, client: httpx.AsyncClient, page: int, progress_callback: Callable = None):
        if self._cancelled:
            return
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
        self._cancelled = False
        self.results = []
        async with httpx.AsyncClient() as client:
            total_pages = await self.get_latest_page(client)
            tasks = []
            for page in range(total_pages):
                tasks.append(self.fetch_page(client, page, progress_callback))
            
            # Using semaphore to limit concurrency
            sem = asyncio.Semaphore(5)
            async def sem_task(task):
                if self._cancelled: return
                async with sem:
                    return await task
            
            await asyncio.gather(*(sem_task(t) for t in tasks))
        
        return self.results

    async def fetch_page_with_token(self, client: httpx.AsyncClient, next_token: str = None) -> dict:
        url = "https://e-hentai.org/favorites.php"
        params = {}
        if next_token:
            params["next"] = next_token
        
        response = await client.get(url, params=params, headers=self.headers, follow_redirects=True, timeout=30)
        if response.status_code != 200:
            return {"items": [], "next": None}
            
        soup = BeautifulSoup(response.text, 'html.parser')
        items = self.parse_list(soup)
        
        # Extract next token from a#unext
        next_button = soup.select_one("a#unext")
        new_token = None
        if next_button and next_button.get("href"):
            href = next_button.get("href")
            import urllib.parse as urlparse
            from urllib.parse import parse_qs
            parsed = urlparse.urlparse(href)
            qs = parse_qs(parsed.query)
            if "next" in qs:
                new_token = qs["next"][0]
                
        return {"items": items, "next": new_token}

    async def fetch_page_standalone(self, client: httpx.AsyncClient, page: int) -> List[LinkInfo]:
        url = f"https://e-hentai.org/favorites.php?page={page}"
        response = await client.get(url, headers=self.headers, follow_redirects=True, timeout=30)
        if response.status_code != 200:
            return []
        soup = BeautifulSoup(response.text, 'html.parser')
        return self.parse_list(soup)

    def save_to_csv(self, file_path: str, results: List[LinkInfo] = None):
        import os
        import csv
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
        
        data = results if results is not None else self.results
        with open(file_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Title', 'Link'])
            for item in data:
                writer.writerow([item.title, item.link])
