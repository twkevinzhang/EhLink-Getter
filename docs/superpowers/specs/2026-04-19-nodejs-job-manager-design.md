# 設計規格：Node.js JobManager（下載任務管理重構）

**日期**：2026-04-19  
**分支**：dev  
**狀態**：已確認，待實作

---

## 背景與問題

現有架構中，下載任務的狀態（running/paused/error）儲存在 Vue3 Pinia store，而實際的下載迴圈（逐圖片 axios 請求）在 Node.js `DownloadService` 的 `for` loop 裡執行。

當用戶按下「暫停」或「終止」時，Pinia 只更新本地狀態，無法中斷正在 `await` 中的 axios 請求，導致 Go sidecar 持續下載圖片直到當前 gallery 完成。

---

## 目標

- Node.js 成為下載任務狀態的 SSOT（Single Source of Truth）
- 暫停/終止能真實中斷正在進行的 HTTP 請求（via AbortController）
- 整個 job queue、逐圖片下載迴圈、進度追蹤全部移至 Node.js
- Vue 透過 IPC push event 接收狀態更新，Pinia 作為純 UI 快取
- Node.js 負責持久化（electron-store）

---

## 元件職責

### 新增：`JobManager` (`src/main/services/job_manager.ts`)

Node.js SSOT 核心，職責：

- 維護記憶體中的 `Map<jobId, JobState>`
- 管理每個 job 的 `AbortController`（`Map<jobId, AbortController>`）
- 排程執行（最多 `MAX_CONCURRENT_JOBS = 3` 個 job 同時跑）
- 每次狀態變更後：① push `download-job-updated` IPC event ② 寫入 electron-store
- App 啟動時從 electron-store 載入既有 jobs，並將 `running` 狀態重置為 `paused`

公開方法：`addJob`, `startJob`, `pauseJob`, `stopJob`, `restartJob`, `getJobs`

### 重構：`DownloadService` (`src/main/services/download_service.ts`)

職責縮小為執行單一 gallery 的下載：

- 接收 `signal: AbortSignal` 與 `onProgress: (data) => void` 參數
- 所有 axios 呼叫帶 `{ signal }`
- 進度透過 `onProgress` callback 回報，不直接發送 IPC
- 不再知道 job 概念

### 簡化：`useDownloadStore` (`src/renderer/src/stores/download.ts`)

純 UI 快取層：

- App 掛載時呼叫 `get-jobs` IPC 做初始同步
- 監聽 `download-job-updated` push event 更新本地快取
- `startJob` / `pauseJob` / `stopJob` / `restartJob` 方法為 IPC proxy
- 移除：`processDownload`、`useElectronStorage`（jobs 欄位）、`onDownloadStatusUpdate`

---

## IPC 介面

### Invoke（renderer → main）

| Channel               | Payload                                                            | 回傳         |
| --------------------- | ------------------------------------------------------------------ | ------------ |
| `get-jobs`            | —                                                                  | `JobState[]` |
| `add-to-queue`        | `{ jobId, title, galleries, targetTemplate, isArchive, password }` | `void`       |
| `start-job`           | `{ jobId }`                                                        | `void`       |
| `pause-job`           | `{ jobId }`                                                        | `void`       |
| `stop-job`            | `{ jobId }`                                                        | `void`       |
| `restart-job`         | `{ jobId }`                                                        | `void`       |
| `clear-finished-jobs` | —                                                                  | `void`       |

移除：`download-gallery`（邏輯移入 JobManager）

### Push Event（main → renderer）

| Event                  | Payload    | 說明                            |
| ---------------------- | ---------- | ------------------------------- |
| `download-job-updated` | `JobState` | 任何狀態變更時推送完整 JobState |

移除：`download-status-update`

---

## 資料流

### 下載進度回報流程

```
JobManager.startJob()
  └→ DownloadService.downloadGallery({ signal, onProgress })
       └→ onProgress({ status, progress }) 每張圖片下載後呼叫
            └→ JobManager 更新 gallery 狀態
                 └→ push 'download-job-updated' (完整 JobState)
                 └→ 寫入 electron-store
```

### 暫停/終止流程

```
Vue 呼叫 pause-job / stop-job IPC
  └→ JobManager.pauseJob(jobId) / stopJob(jobId)
       └→ controller.abort()
       └→ 從 AbortController Map 移除
       └→ job.mode = 'paused' / 'error'
       └→ push event + 寫 store
```

DownloadService 的 axios catch 到 `CanceledError` 後拋出，JobManager 識別為用戶主動中斷，不視為錯誤。

---

## Job 狀態機

```
pending → running → completed
               ↘ paused → running（restart/resume）
               ↘ error
```

- **pending**：加入佇列，等待執行
- **running**：JobManager 正在執行下載迴圈
- **paused**：abort 已呼叫，已完成的 gallery 保留進度，下次 start 從未完成的繼續
- **error**：用戶強制終止或致命錯誤
- **completed**：所有 gallery 下載完畢

App 重啟後，electron-store 中 `running` 狀態的 job 一律重置為 `paused`。

---

## 錯誤處理

| 情境                                         | 處理方式                                     |
| -------------------------------------------- | -------------------------------------------- |
| 單張圖片下載失敗                             | 記錄 warn，跳過，繼續下一張                  |
| 整個 gallery 失敗（如 image-links 取得失敗） | `gallery.mode = 'error'`，繼續下一個 gallery |
| axios CanceledError（用戶 abort）            | 停止迴圈，不標記 error，保留進度             |
| 其他未預期錯誤                               | `gallery.mode = 'error'`，記錄訊息           |

---

## 並行控制

`JobManager` 維護 `runningCount`。`startJob` 前檢查是否超過 `MAX_CONCURRENT_JOBS = 3`。若超過，job 留在 `pending`。每個 job 完成後呼叫 `tryStartNext()` 自動觸發佇列中下一個 job。

---

## 持久化

- electron-store key：`download.jobs`（`JobState[]`）
- 寫入時機：每次 JobManager 狀態變更後同步寫入
- 讀取時機：JobManager 建構子初始化時

---

## 受影響的檔案

| 檔案                                    | 變更類型                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/main/services/job_manager.ts`      | 新增                                                                                    |
| `src/main/services/download_service.ts` | 重構（移除 job 邏輯，加入 signal/onProgress）                                           |
| `src/main/index.ts`                     | 新增 IPC handlers，移除舊 `download-gallery` handler                                    |
| `src/renderer/src/stores/download.ts`   | 大幅簡化                                                                                |
| `src/shared/types/api.ts`               | 新增/更新 JobState, IPC 類型定義                                                        |
| `src/preload/index.ts`                  | 新增 `getJobs`, `startJob`, `pauseJob`, `stopJob`, `restartJob`, `onDownloadJobUpdated` |
