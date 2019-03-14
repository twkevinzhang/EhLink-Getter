from datetime import datetime

# info
DEVELOPMENT = True
__version__ = 0.1
PROJECT_NAME='EhLink-Getter'

# File Name
now=datetime.now().strftime('%Y%m%d_%H%M%S')
COOKIES_FILE_NAME = "cookies.txt"
FILTER_FILE_NAME="./a/filter.csv"
OUT_FILE_NAME="./a/{}_FavoriteList.csv".format(datetime.now().strftime('%Y%m%d%H%M%S'))
LOG_FILE_NAME="./log/"+now+".log"

# path
E_HOST = 'https://e-hentai.org'
EXHOST = 'https://exhentai.org'
LOGIN_PATH = 'https://forums.e-hentai.org/index.php?act=Login'
FAVORITE_PATH = 'https://e-hentai.org/favorites.php'
LOGIN_SUCCESS_PATH = "https://forums.e-hentai.org/index.php?act=Login&CODE=01"
