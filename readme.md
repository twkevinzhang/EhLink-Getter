### TL;DR
 - install python 3.9
 - run directly from source code:
 
        pip install -r requirements.txt
        git clone https://github.com/neslxzhen/Eh-Link-Getter.git
        cd Eh-Link-Getter
        flask run

### feature
##### Get favorite book list
1. 將cookie放在cookie.txt中，格式

        ipb_member_id=354xxxx;ipb_pass_hash=309acxxxxxxxxxxxxxxxxxxxxxxxxxxx;ipb_session_id=283c57425xxxxxxxxxxxxxxxxxxxxxxx;sk=6bcxxxxxxxxxxxxxxxxxxxxxxxxx

2. 在`cmd`中輸入`python main.py`
3. 選擇`a> download favorite list`來下載 [Favorite] 的連結
4. 輸出結果會放在`./a/執行開始時間_FavoriteList.csv`

[Favorite]: https://e-hentai.org/favorites.php

###### Get link with title
有時我們想要檢查本子庫裡的本子是否完整，得到本子庫的標題清單後，就需要其連結

如果你想要搜尋的本子的`gid`在`0~1453698`之間(`2019-07-27 21:28`之前)，則可以使用這個方法來大幅提升效率。

1. 解壓縮`b_input/metadata.7z`，將其中的`metadata.json`放在`b_input/`
2. 在`b_input/titles.txt`中輸入關鍵字(標題)，一行一筆
3. 在`cmd`中輸入`python main.py`
4. 選擇`b> find link with title`
5. 輸出結果會放在`b_input/執行開始時間_link.csv`

### TODO
 - 🔨 ... UI for web
 - [ ] 改用帳密輸入，介面更人性化
 - [ ] 進度條
 - [ ] installer for windows
