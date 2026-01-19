import random
from typing import List, Optional
import httpx

class ProxyManager:
    def __init__(self, proxies: List[str]):
        self.proxies = proxies
        self.current_index = 0

    def get_proxy(self) -> Optional[str]:
        if not self.proxies:
            return None
        proxy = self.proxies[self.current_index]
        return proxy

    def rotate(self):
        if not self.proxies:
            return
        self.current_index = (self.current_index + 1) % len(self.proxies)

    def get_client_args(self) -> dict:
        proxy = self.get_proxy()
        if proxy:
            return {"proxy": proxy}
        return {}
