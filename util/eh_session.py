from const import *
from util.session import Session

COOKIES_KEYS = ["ipb_member_id", "ipb_pass_hash", "ipb_session_id", "sk"]
COOKIES_NAME = "Cookie"

class EhSession(Session):
    def __init__(self):
        super().__init__()
        self.has_login = False
        self.set_cookies(cookies_dict={COOKIES_NAME:open(COOKIES_FILE_NAME).read().strip()})

    def set_cookies(self,cookies_dict:dict):
        super().set_cookies(cookies_dict)
        self.session.headers.update(cookies_dict)
        cookies_str=super().get_cookies(COOKIES_NAME)
        if 'ipb_member_id' in cookies_str and 'ipb_pass_hash' in cookies_str:
            self.has_login = True
