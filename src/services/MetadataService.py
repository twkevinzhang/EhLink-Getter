import json
import os
from io import TextIOWrapper

from const import METADATA_FILE_NAME, FULL_LOADING
from src.entities.LinkInfo import LinkInfo
from src.services.TsvService import TsvService


class MetadataService:
    def __init__(self, tsv_service: TsvService = None, file_name: str = METADATA_FILE_NAME, full_loading : bool = FULL_LOADING):
        self.file_name = file_name
        self.tsv_service = tsv_service
        self.full_loading = full_loading

    def find_link(self, title: str):
        if not os.path.exists(METADATA_FILE_NAME):
            raise FileNotFoundError(f'找不到檔案 {METADATA_FILE_NAME}')
        if self.tsv_service is None:
            print(f'tsv_service is None, 所以不儲存')

        # todo: 多執行緒
        stream = open(METADATA_FILE_NAME, 'r', encoding='utf-8')
        if self.full_loading:
            stream = stream.readlines()

        for meta in stream:
            meta = json.loads(meta)
            if title in meta["title"]:
                print("找到了: " + meta["title"])
                info = LinkInfo(
                    title=meta["title"],
                    link=f'https://e-hentai.org/g/{str(meta["gid"])}/{meta["token"]}/'
                )
                if self.tsv_service is None:
                    print(info.toString())
                else:
                    self.tsv_service.save([info])
                break

        if isinstance(stream, TextIOWrapper):
            stream.close()
