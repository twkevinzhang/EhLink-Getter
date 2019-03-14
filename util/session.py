import json
import time
import requests
import random
from util.logger import logger


class Session():
    def __init__(self):
        self.session = requests.Session()
        self.session.headers = {
            'User-Agent': make_ua(),
            'Accept-Charset': 'utf-8;q=0.7,*;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Connection': 'keep-alive'
        }
        self.timeout = 5

    def set_cookies(self,cookies_dict:dict):
        self.session.headers.update(cookies_dict)

    def get_cookies(self,cookies_name):
        return self.session.headers[cookies_name]

    def request(self, method, url, data=None,delay=0,title=None,retry=5):
        for i in range(retry):
            try:
                if delay:time.sleep(delay)
                return self.session.request(
                    method,
                    url,
                    allow_redirects=False,
                    data=data,
                    timeout=self.timeout)
            except (requests.HTTPError, requests.Timeout,requests.ConnectionError) as e:
                logger.warning('Warning: {0}, retrying({1}) ...'.format(str(e), i))
                pass
        logger.error("can't get res: "+title)
        return None


def parse_cookie(coostr):
    ret = {}
    for coo in coostr.split(";"):
        coo = coo.strip()
        if coo.lower() in ('secure', 'httponly'):
            continue
        _ = coo.split("=")
        k = _[0]
        v = "=".join(_[1:])
        if k.lower() in ('path', 'expires', 'domain', 'max-age', 'comment'):
            continue
        ret[k] = v
    return ret


def make_cookie(coodict):
    return ";".join(map("=".join, coodict.items()))


def make_ua():
    rrange = lambda a, b, c=1: c == 1 and random.randrange(a, b) or int(1.0 * random.randrange(a * c, b * c) / c)
    return 'Mozilla/%d.0 (Windows NT %d.%d) AppleWebKit/%d (KHTML, like Gecko) Chrome/%d.%d Safari/%d' % (
        rrange(4, 7, 10), rrange(5, 7), rrange(0, 3), rrange(535, 538, 10),
        rrange(21, 27, 10), rrange(0, 9999, 10), rrange(535, 538, 10)
    )
