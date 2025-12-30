import random
from typing import Dict

def make_ua():
    rrange = lambda a, b, c=1: c == 1 and random.randrange(a, b) or int(1.0 * random.randrange(a * c, b * c) / c)
    return 'Mozilla/%d.0 (Windows NT %d.%d) AppleWebKit/%d (KHTML, like Gecko) Chrome/%d.%d Safari/%d' % (
        rrange(4, 7, 10), rrange(5, 7), rrange(0, 3), rrange(535, 538, 10),
        rrange(21, 27, 10), rrange(0, 9999, 10), rrange(535, 538, 10)
    )

def build_headers(cookies: str = "") -> Dict[str, str]:
    headers = {
        'User-Agent': make_ua(),
        'Accept-Charset': 'utf-8;q=0.7,*;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Connection': 'keep-alive'
    }
    if cookies:
        headers['Cookie'] = cookies
    return headers
