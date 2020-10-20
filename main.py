import json
import os

from bs4 import BeautifulSoup
from const import *
from util.eh_session import EhSession


def get_list(html, save_format=None, filter=True):
    array = []
    for page_no in range(get_last_page_no(html)):
        soup = BeautifulSoup(html, "html.parser")
        items = soup.select("table.itg.gltm div.glink")
        for i in items:
            title = i.text
            link = i.parent.get("href")
            if filter and link_saved(link):
                continue
            d = {"title": title, "link": link}
            array.append(d)
            if save_format == "csv":
                save_favorite_to_csv(d,FAVORITE_LIST_NAME)
        url = "https://e-hentai.org/favorites.php?page=" + str(page_no)
        html = EhSession().request("GET", url).text
    return array


def get_last_page_no(html):
    soup = BeautifulSoup(html, "html.parser")
    nav = soup.select("table.ptt td")
    return int(nav[len(nav) - 2].text)


def save_favorite_to_csv(dict,fileName):
    line = dict['link'] + "," + dict['title']
    open(fileName, 'a', encoding='utf-8').write(line + "\n")
    save_link_to_filter(dict['link'], dict['title'])
    print("連結已儲存:", line)


def link_saved(link):
    # todo: 多執行緒
    for l in open(FILTER_FILE_NAME, 'r', encoding='utf-8'):
        if link == l.strip().split(',')[0]:
            return True
    return False


def save_link_to_filter(link, title=None):
    open(FILTER_FILE_NAME, 'a', encoding='utf-8').write(link + "," + title + "\n")


def get_link(title):
    if not os.path.exists(METADATA_FILE_NAME):
        return
    for m in open(METADATA_FILE_NAME, 'r', encoding='utf-8'):
        # todo: 多執行緒
        m = json.loads(m)
        if title in m["title"]:
            print("match: "+m["title"])
            link = " https://e-hentai.org/g/" + str(m['gid']) + "/" + m["token"] + "/"
            save_favorite_to_csv({'link': link, 'title': m["title"]},TARGET_LIST_NAME)
            break


# main
d={
    'a':"get favorite list",
    'b':"get link with title",
    'input':''
}
arg = input("\n".join([key+"> "+d[key] for key in d]))
if arg == 'a':
    html = EhSession().request("GET", "https://e-hentai.org/favorites.php").text
    get_list(html, save_format="csv")
elif arg == 'b':
    for l in open(SEARCH_TARGET_FILE_NAME, 'r', encoding='utf-8'):
        l=l.strip()
        get_link(l)

print("Done!")
