import httpx
from bs4 import BeautifulSoup
from typing import List
from ..entities.link_info import LinkInfo

class EhScraperService:
    def __init__(self, headers: dict):
        self.headers = headers
        self.results = []
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def parse_list(self, soup: BeautifulSoup) -> List[LinkInfo]:
        return [
            LinkInfo(
                title=title_element.text,
                link=title_element.parent.get("href")
            )
            for title_element in soup.select("table.itg.gltm div.glink")
        ]

    async def fetch_page_with_token(self, client: httpx.AsyncClient, url: str, next_token: str = None) -> dict:
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

