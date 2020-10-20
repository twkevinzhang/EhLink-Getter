from datetime import datetime

# info
DEVELOPMENT = True
__version__ = 0.1
PROJECT_NAME='EhLink-Getter'

# File Name
now=datetime.now().strftime('%Y%m%d_%H%M%S')
LOG_FILE_NAME="./log/"+now+".log"
COOKIES_FILE_NAME = "cookies.txt"

A_DIR="./a/"
FILTER_FILE_NAME=A_DIR+"filter.csv"
FAVORITE_LIST_NAME= A_DIR+now+"_FavoriteList.csv"

B_DIR="./b/"
SEARCH_TARGET_FILE_NAME=B_DIR+"target.txt"
METADATA_FILE_NAME=B_DIR+"metadata.json"
TARGET_LIST_NAME=B_DIR+now+"_link.csv"

# path
E_HOST = 'https://e-hentai.org'
EXHOST = 'https://exhentai.org'
LOGIN_PATH = 'https://forums.e-hentai.org/index.php?act=Login'
FAVORITE_PATH = 'https://e-hentai.org/favorites.php'
LOGIN_SUCCESS_PATH = "https://forums.e-hentai.org/index.php?act=Login&CODE=01"
