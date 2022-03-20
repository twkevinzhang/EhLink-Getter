import asyncio
import sys
import grequests
import requests
from bs4 import BeautifulSoup
from requests.structures import CaseInsensitiveDict

from src.entities.LinkInfo import LinkInfo

loop = asyncio.get_event_loop()


class EhFavoriteService:
    def __init__(self, headers: CaseInsensitiveDict):
        self.headers = headers
        self.response_list = None

    def scrapy(self):
        urls = list(map(
            lambda page: f"https://e-hentai.org/favorites.php?page={str(page)}",
            range(self.latest_page())
        ))
        self.response_list = grequests.imap(
            [grequests.get(u, headers=self.headers) for u in urls],
            size=10,
            exception_handler=lambda request, exception: print("Request failed: ", exception)
        )

    def get_list(self):
        return flat_map(list(map(
            lambda response: self.parse_list(BeautifulSoup(response.text, 'html.parser')),
            self.response_list
        )))

    def parse_list(self, soup: BeautifulSoup) -> list[LinkInfo]:
        return list(map(
            lambda title_element: LinkInfo(
                title=title_element.text,
                link=title_element.parent.get("href")
            ),
            soup.select("table.itg.gltm div.glink")
        ))

    def latest_page(self) -> int:
        response = requests.get("https://e-hentai.org/favorites.php", headers=self.headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        nav = soup.select("table.ptt td")
        return int(nav[len(nav) - 2].text)


def flat_map(list: list[list]) -> list:
    flatted = []
    for sublist in list:
        for i in sublist:
            flatted.append(i)
    return flatted
