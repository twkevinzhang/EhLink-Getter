# EhLink-Getter 專案開發路線圖 (Roadmap)

本文件概述了將 EhLink-Getter 轉型為全方位漫畫下載與管理桌機應用程式的開發計畫。

## 專案目標

將現有的連結爬蟲工具改造為具備以下三大核心能力的桌面應用程式：

1.  **Request 管理**：強大的網路請求控制（Proxy 池、並發控制、重試機制）。
2.  **排程下載任務管理**：完整的任務生命週期管理（設定、新增、執行中、已完成）。
3.  **漫畫檔案管理**：具有 E-Hentai 主題配色的本地檔案瀏覽與搜尋系統。

---

## 階段一：核心網路架構升級 (Sidecar 2.0)

本階段專注於後端 (Sidecar) 的網路能力強化，為下載功能打好基礎。

### 1. Request 管理模組

- [ ] **多重 Proxy 支援 (Socks5h/HTTP)**
  - 修改設定檔結構以支援 Proxy 列表。
  - 實作 Proxy 輪詢與故障轉移 (Failover) 機制：請求失敗時自動切換下一個 Proxy。
- [ ] **並發與超時控制**
  - 實作 `scan_thread_cnt`：控制 Metadata/頁面掃描的執行緒數量。
  - 實作 `download_thread_cnt`：控制圖片下載的執行緒數量。
  - 實作全域 `download_timeout` 設定。

### 2. Sidecar 下載能力擴充

- [ ] **圖片解析與下載器**
  - 新增 `GalleryParser`：解析 `/g/` 頁面取得圖片頁面列表。
  - 新增 `ImageParser`：解析 `/s/` 頁面取得原始圖片 URL。
  - 實作檔案下載邏輯（寫入磁碟）。
- [ ] **Sidecar API 擴充**
  - 新增 `/job/start` endpoint：接收下載指令（URL、目標路徑、Cookie、Proxy 設定）。
  - 新增 `/job/status` endpoint：回報下載進度。

---

## 階段二：排程下載任務管理系統 (Task Management)

本階段專注於 Electron 前端的任務管理介面，採用多階段流水線設計：**Fetch (抓取列表) -> Review (設定參數) -> Download (下載內容)**。

### 1. 任務持久化與設定 (Settings Tab)

- [ ] **任務資料庫 (`tasks.json`)**
  - 實作 `tasks.json` 的讀寫邏輯。
  - 介面：強制設定 `tasks.json` 位置（若非空則鎖定）。
  - 實作「邏輯儲存」與「傳統儲存」的設定選項。
- [ ] **儲存策略實作**
  - **邏輯儲存 (Logical)**：實作 `metadata.json` 維護與 `files/${createdAt}_${xxHash64}` 路徑生成邏輯。
  - **傳統儲存 (Traditional)**：實作基於標題/ID 的資料夾命名邏輯。

### 2. 列表抓取階段 (Start Fetch & Fetching Tabs)

- [ ] **抓取請求介面 (Start Fetch Tab)**
  - 輸入：單一 Page Link。
  - 設定：下載範圍（頁數）、`metadata_list.json` 位置選擇。
  - 動作：發送請求至 Sidecar 解析列表。
- [ ] **抓取進度監控 (Fetching Tab)**
  - 顯示 Page Link 抓取進度。

### 3. 審核與參數配置階段 (Fetched Tab)

- [ ] **抓取結果檢視**
  - 顯示已抓取到的 Gallery 列表 (Panel 形式)。
- [ ] **下載參數設定** (於此階段配置，而非開始前)
  - **路徑設定**：實作路徑佔位符 (`{EN_TITLE}`, `{ID}`, `{JP}`) 與快捷輸入按鈕。
  - **歸檔設定**：實作封存 (Archive) 選項：自動打包 ZIP 與密碼保護。
- [ ] **加入下載佇列**
  - 實作「全部加入下載任務」按鈕，將 Gallery 轉換為實際下載任務。

### 4. 執行與監控階段 (Downloading & Completed Tabs)

- [ ] **下載中 (Downloading)**
  - 任務結構：Page Link Panel -> Gallery List -> Image Progress。
  - 實作與 Sidecar 的輪詢 (Polling) 機制。
  - 實作暫停/刪除任務功能（刪除時詢問是否保留檔案）。
- [ ] **已完成 (Completed)**
  - 實作歷史任務列表。
  - 實作任務刪除邏輯（連動檔案刪除選項）。

---

## 階段三：漫畫檔案管理與搜尋 (Library Management)

本階段將整合並升級現有的 Metadata 搜尋功能，打造沉浸式的閱覽體驗。

### 1. 檔案索引與搜尋引擎

- [ ] **Metadata 搜尋升級**
  - 整合 `Mapping Metadata` 與 `Search Metadata` 功能。
  - 實作多標籤 (Tag) 檢索（包含/精確匹配）。
  - 實作進階過濾：是否被 EH 刪除 (Expunged)、最低評分 (Rating)、檔名/URL 匹配。
- [ ] **匯出功能**
  - 實作搜尋結果匯出（用於遷移或備份）。

### 2. 畫廊介面 (Gallery UI)

- [ ] **E-Hentai 主題配色介面**
  - 實作網格狀封面視圖 (Grid View)。
  - 縮圖邏輯：讀取本地漫畫第一張圖片，若無則顯示佔位圖。
  - 實作配色與佈局仿製 (參考 `local-ehentai`)。

---

## 階段四：整合與優化 (Polish)

- [ ] **舊功能清理**
  - 移除 `Download Page` 與獨立的 `Configuration` 頁面。
  - 整合 `System Logs` 至新介面佈局。
- [ ] **使用者體驗優化**
  - 驗證佔位符系統的正確性。
  - 測試長時間運行的穩定性 (Memory Leak 檢查)。
  - 驗證「邏輯儲存」與外部工具 (`flat-storage`) 的相容性。
