### TL;DR
 - install python 3.8
 - run directly from source code:
 
        pip install bs4
        pip install requests
        git clone https://github.com/neslxzhen/Eh-Link-Getter.git
        cd Eh-Link-Getter
        python main.py
### How to use?
1. 將cookie放在`./cookie.txt`中，格式

        ipb_member_id=354xxxx;ipb_pass_hash=309acxxxxxxxxxxxxxxxxxxxxxxxxxxx;ipb_session_id=283c57425xxxxxxxxxxxxxxxxxxxxxxx;sk=6bcxxxxxxxxxxxxxxxxxxxxxxxxx
2. (可選)輸入要過濾(已經有下載過，不需要的)的連結至`./a/filter.csv`
3. 在`cmd`中輸入`python main.py`
4. 選擇`a> get favorite list`來下載(Favorite)[https://e-hentai.org/favorites.php]的連結
5. 輸出結果會放在`./a/執行開始時間_FavoriteList.csv`
