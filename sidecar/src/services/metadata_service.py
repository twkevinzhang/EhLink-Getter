import json
import os
from typing import List, Optional
from ..entities.link_info import LinkInfo

class MetadataService:
    def __init__(self, metadata_path: str):
        self.metadata_path = metadata_path

    def find_links(self, title_query: str, limit: int = 10) -> List[LinkInfo]:
        if not os.path.exists(self.metadata_path):
            raise FileNotFoundError(f"Metadata file not found: {self.metadata_path}")
        
        results = []
        with open(self.metadata_path, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    meta = json.loads(line)
                    if title_query.lower() in meta["title"].lower():
                        results.append(LinkInfo(
                            title=meta["title"],
                            link=f'https://e-hentai.org/g/{meta["gid"]}/{meta["token"]}/'
                        ))
                        if len(results) >= limit:
                            break
                except Exception:
                    continue
        return results
