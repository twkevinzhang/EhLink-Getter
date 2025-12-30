from const import FAVORITE_LIST_NAME
from src.entities.LinkInfo import LinkInfo


class TsvService:
    def __init__(self, file_name: str = FAVORITE_LIST_NAME):
        self.file_name = file_name

    def save(self, link_list: list[LinkInfo]):
        new_str_list = map(
            lambda link_info: link_info.toString(),
            link_list
        )
        open(self.file_name, 'w', encoding='utf-8').write('\n'.join(new_str_list))
        print("連結們已儲存")
