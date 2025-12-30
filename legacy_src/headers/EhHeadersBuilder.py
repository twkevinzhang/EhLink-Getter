from const import *
from src.headers.HeadersBuilder import HeadersBuilder

COOKIES_KEYS = ["ipb_member_id", "ipb_pass_hash", "ipb_session_id", "sk"]
COOKIES_NAME = "Cookie"

class EhHeadersBuilder(HeadersBuilder):
    def __init__(self, file_name: str = COOKIES_FILE_NAME):
        super().__init__()
        super().set_default()
        super().set_cookies({COOKIES_NAME: open(file_name).read().strip()})

