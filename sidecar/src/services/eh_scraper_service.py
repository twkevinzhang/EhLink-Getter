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
        """Parse gallery list with fallback selectors for different EH views"""
        results = []
        
        # 嘗試多種常見的選擇器
        # 1. 之前使用的 table.itg.gltm div.glink (Minimal+, Compact)
        # 2. table.itg.gltc div.glink (Extended)
        # 3. div.gl1t a (Thumbnail view)
        # 4. 通用的 .glink
        
        glinks = soup.select("div.glink")
        if not glinks:
            # 嘗試縮圖模式的選擇器
            glinks = soup.select("div.glpt") # 這是分頁導航，不是。
            # 更通用的搜尋：含有 /g/ 的連結
            glinks = [a for a in soup.find_all("a") if "/g/" in a.get("href", "") and a.find_all(True, recursive=False) == []]

        for element in soup.select("div.glink"):
            # 尋找最近的 <a> 標籤
            a_tag = element.find_parent("a")
            if a_tag and a_tag.get("href"):
                results.append(LinkInfo(
                    title=element.text.strip(),
                    link=a_tag.get("href")
                ))
        
        # 如果還是空的，嘗試另一種常見結構 (Minimal 視圖)
        if not results:
            for td in soup.select("td.gl3c.glname"):
                a_tag = td.select_one("a")
                div_glink = td.select_one("div.glink")
                if a_tag and div_glink:
                    results.append(LinkInfo(
                        title=div_glink.text.strip(),
                        link=a_tag.get("href")
                    ))

        return results

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

