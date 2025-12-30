# EhLink-Getter 桌面版使用手冊

歡迎使用 EhLink-Getter！這是一個基於 Electron + Vue 3 開發的現代化工具，旨在幫助您輕鬆管理與抓取 E-Hentai 資源。

---

## 🚀 安裝指南

### 1. 取得程式

目前程式支援自行編譯或從發行(Release)頁面下載安裝檔。

### 2. 環境需求

- **作業系統**: Windows 10+, macOS 11+, 或主流 Linux 發行版。
- **本地組件**: 若您是開發者，請確保已安裝 Node.js 18+ 與 Python 3.9+。

---

## 核心功能說明

### 1. 任務控制台 (Task Console)

這是程式的核心入口，提供了兩種抓取模式：

![任務控制台](./docs/images/dashboard.png)

#### A. 收藏夾抓取 (Download Favorites)

- **功能**: 自動登入並遍歷您的 E-Hentai 收藏夾。
- **輸出路徑**: 您可以自定義下載的檔名格式，如：`./output/{execute_started_at}_FavoriteList.csv`。

#### B. 任意頁面抓取 (Download Other Page)

- **功能**: 支援抓取任何列表頁面（搜尋結果、標籤列表、特定分類等）。
- **目標 URL**: 輸入頁面的完整網址（例如 `https://e-hentai.org/?f_cats=96`）。
- **同步控制**: 當一個任務正在執行時，另一個任務按鈕會自動禁用，確保系統穩定。

- **通用功能**:
  - **視覺化進度**: 實時顯示目前的抓取狀態與分頁資訊。
  - **終止任務**: 可隨時點擊「Stop Task」停止抓取，程式會自動處理後續。
  - **自動存檔**: 抓取結束後，由 Electron 主進程直接生成 CSV，支援 UTF-8 BOM，確保 Excel 開啟不亂碼。

### 2. 元數據映射 (Mapping Metadata)

如果您有龐大的 `metadata.json` 索引檔（JSON-L 格式），這個功能可以幫助您快速根據「標題關鍵字」找出對應的連結。

![元數據映射](./docs/images/mapping.png)

- **高效檢索**: 採用 Node.js 串流技術，即使是數 GB 的檔案也能秒速搜尋。
- **關鍵字輸入**: 在左側輸入框輸入您要搜尋的標題，一行一個。
- **自定義欄位**: 可選擇輸出的欄位（如 Title, Link, GID 等）。
- **結果預覽**: 結果會顯示在表格中，點擊連結即可直接開啟瀏覽器查看。

### 3. 設定頁面 (Settings)

![設定頁面](./docs/images/settings.png)

- **[暫未實現] 代理伺服器**: 支援設定 HTTP/HTTPS 代理。

---

## 🛠️ 常見問題處理

- **CSV 亂碼?**: 程式已預設加入 UTF-8 BOM，請使用 Excel 2016+ 或任意純文字編輯器開啟。
- **任務卡住?**: 請檢查網路連線，並確認 Cookie 是否在有效期內。
- **Sidecar 報錯?**: 確保 Python 環境滿足需求。雖然大部分邏輯已移至 Electron，但爬蟲核心仍需 Python 支援。

---

_祝您使用愉快！如有問題請參考專案 GitHub 頁面。_
