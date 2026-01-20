import httpx
import urllib.parse
from bs4 import BeautifulSoup
from typing import List, Optional, Dict
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
        
        # 1. Standard (Minimal+, Compact, Extended) - Usually has div.glink
        glinks = soup.select("div.glink")
        for element in glinks:
            # The <a> is usually a parent or sibling depending on view
            a_tag = element.find_parent("a")
            if a_tag and a_tag.get("href"):
                results.append(LinkInfo(
                    title=element.text.strip(),
                    link=a_tag.get("href")
                ))
        
        # 2. Minimal view (table rows)
        if not results:
            for td in soup.select("td.gl3c.glname"):
                a_tag = td.select_one("a")
                div_glink = td.select_one("div.glink")
                if a_tag and div_glink:
                    results.append(LinkInfo(
                        title=div_glink.text.strip(),
                        link=a_tag.get("href")
                    ))
        
        # 3. Thumbnail view
        if not results:
            for gl1t in soup.select("div.gl1t"):
                a_tag = gl1t.select_one("div.gl2t a") or gl1t.select_one("a")
                if a_tag and a_tag.get("href"):
                    # Title is often in a specific div in thumbnail view
                    title = a_tag.get("title") or a_tag.text.strip()
                    results.append(LinkInfo(
                        title=title,
                        link=a_tag.get("href")
                    ))

        return results

    async def fetch_page_with_token(self, client: httpx.AsyncClient, url: str, next_token: Optional[str] = None) -> dict:
        """Fetch a single page, optionally using a token for pagination."""
        target_url = url
        if next_token:
            # EH uses search params for pagination: page=N or next=ID
            # Ensure we don't duplicate ?
            parsed = urllib.parse.urlparse(target_url)
            query = urllib.parse.parse_qs(parsed.query)
            
            # Use 'next' for token-based, 'page' for page-based
            if next_token.isdigit():
                query['page'] = [next_token]
            else:
                query['next'] = [next_token]
                
            new_query = urllib.parse.urlencode(query, doseq=True)
            target_url = urllib.parse.urlunparse(parsed._replace(query=new_query))

        response = await client.get(target_url, headers=self.headers, follow_redirects=True, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        items = self.parse_list(soup)
        
        # Find next page/token
        next_val = None
        ptt = soup.select_one("table.ptt")
        if ptt:
            next_a = ptt.find("a", string=">") # The '>' button
            if next_a:
                next_href = next_a.get("href")
                if next_href:
                    next_parsed = urllib.parse.urlparse(next_href)
                    next_qs = urllib.parse.parse_qs(next_parsed.query)
                    if "next" in next_qs:
                        next_val = next_qs["next"][0]
                    elif "page" in next_qs:
                        next_val = next_qs["page"][0]
                    elif "from" in next_qs:
                        next_val = next_qs["from"][0]

        return {
            "items": items,
            "next": next_val
        }

    async def fetch_gallery_metadata(self, client: httpx.AsyncClient, url: str) -> dict:
        """Fetch all image page links from a gallery, handling pagination."""
        all_image_links = []
        current_url = url
        
        # To avoid infinite loops, set a reasonable page limit (e.g., 200 pages)
        title = "Unknown"
        title_jp = ""
        
        for _ in range(200):
            response = await client.get(current_url, headers=self.headers, follow_redirects=True, timeout=30)
            if response.status_code != 200:
                break
                
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract basic metadata from the first page
            if not all_image_links:
                title = soup.select_one("#gn").text.strip() if soup.select_one("#gn") else "Unknown"
                title_jp = soup.select_one("#gj").text.strip() if soup.select_one("#gj") else ""
            
            # Find thumbnails/image page links
            image_anchors = soup.select("div#gdt a")
            for a in image_anchors:
                link = a.get("href")
                if link and "/s/" in link:
                    all_image_links.append(link)
            
            # Find next page link in pagination table (ptt)
            next_page = None
            ptt = soup.select_one("table.ptt")
            if ptt:
                selected = ptt.select_one("td.ptds")
                if selected:
                    next_td = selected.find_next_sibling("td")
                    if next_td:
                        a_next = next_td.select_one("a")
                        if a_next:
                            next_page = a_next.get("href")
            
            if not next_page:
                break
            current_url = next_page

        return {
            "title": title,
            "title_jp": title_jp,
            "image_links": all_image_links,
            "count": len(all_image_links)
        }

