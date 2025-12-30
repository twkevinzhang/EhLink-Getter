from datetime import datetime

# info
DEVELOPMENT = True
__version__ = 0.1
PROJECT_NAME = 'EhLink-Getter'

# File Name
now = datetime.now().strftime('%Y%m%d_%H%M%S')
LOG_FILE_NAME = f'./log/{now}.log'
OUTPUT_FOLDER = "./output"
COOKIES_FILE_NAME = "./cookies.txt"

FAVORITE_LIST_NAME = OUTPUT_FOLDER + f'/{now}_FavoriteList.csv'

B_DIR = "./b_input"
FULL_LOADING = True
TITLES_FILE_NAME = B_DIR + "/titles.txt"
METADATA_FILE_NAME = B_DIR + "/metadata.json"
TARGET_LIST_NAME = OUTPUT_FOLDER + f'/{now}_link.tsv'