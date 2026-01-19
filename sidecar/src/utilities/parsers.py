from bs4 import BeautifulSoup
from typing import List, Dict

class GalleryParser:
    @staticmethod
    def parse_gallery_list(html: str) -> List[Dict]:
        """Parse the /g/ list page to get gallery items."""
        soup = BeautifulSoup(html, 'html.parser')
        items = []
        # Basic implementation - will be refined based on actual EH structure
        # Standard EH list uses tables or divs with class 'itg'
        table = soup.find('table', class_='itg')
        if not table:
            return items
            
        rows = table.find_all('tr')[1:] # Skip header
        for row in rows:
            link_tag = row.find('a', href=True)
            if link_tag:
                items.append({
                    "title": link_tag.text.strip(),
                    "url": link_tag['href'],
                    "id": link_tag['href'].split('/')[-3],
                    "token": link_tag['href'].split('/')[-2]
                })
        return items

class ImageParser:
    @staticmethod
    def parse_image_page(html: str) -> str:
        """Parse the /s/ image page to get the original image URL."""
        soup = BeautifulSoup(html, 'html.parser')
        img = soup.find('img', id='img')
        if img:
            return img['src']
        return ""
