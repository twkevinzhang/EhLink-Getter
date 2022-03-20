from const import *
from src.services.EhFavoriteService import EhFavoriteService
from src.headers.EhHeadersBuilder import EhHeadersBuilder
from src.services.MetadataService import MetadataService
from src.services.TsvService import TsvService

d = {
    'a': "Download favorite list",
    'b_input': "Find link with title",
    'input': ''
}
arg = input("\n".join([key + "> " + d[key] for key in d]))
if arg == 'a':
    headers = EhHeadersBuilder().build()
    service = EhFavoriteService(headers)
    service.scrapy()
    storage = TsvService()
    storage.save(service.get_list())

elif arg == 'b_input':
    service = MetadataService(TsvService())
    for line in open(TITLES_FILE_NAME, 'r', encoding='utf-8'):
        title = line.strip()
        service.find_link(title)

print("Done!")
