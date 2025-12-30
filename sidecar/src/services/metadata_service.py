import json
import os
from typing import List, Optional
from ..entities.link_info import LinkInfo

class MetadataService:
    def __init__(self, metadata_path: str):
        self.metadata_path = metadata_path

    def find_links(self, title_query: str, limit: int = 10) -> List[LinkInfo]:
        return self.find_multiple_links([title_query], limit=limit)

    def find_multiple_links(self, queries: List[str], limit: int = 100, raw: bool = False) -> List[dict]:
        if not os.path.exists(self.metadata_path):
            raise FileNotFoundError(f"Metadata file not found: {self.metadata_path}")
        
        results = []
        queries = [q.lower() for q in queries if q.strip()]
        if not queries: return []

        with open(self.metadata_path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    meta = json.loads(line)
                    title_lower = meta["title"].lower()
                    
                    found = False
                    for q in queries:
                        if q in title_lower:
                            found = True
                            break
                    
                    if found:
                        if raw:
                            results.append(meta)
                        else:
                            results.append({
                                "title": meta["title"],
                                "link": f'https://e-hentai.org/g/{meta["gid"]}/{meta["token"]}/'
                            })
                        
                        if len(results) >= limit:
                            break
                except Exception:
                    continue
        return results
