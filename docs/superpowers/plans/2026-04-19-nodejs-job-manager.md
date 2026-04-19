# Node.js JobManager 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將下載任務的 SSOT 從 Vue Pinia 移至 Node.js JobManager，並透過 AbortController 實現真實的暫停/終止功能。

**Architecture:** 新增 `JobManager` class 負責 job 生命週期、排程、持久化、IPC 事件發送；重構 `DownloadService` 為純下載執行器（接收 signal/onProgress）；Pinia store 簡化為 IPC proxy + 狀態快取。

**Tech Stack:** TypeScript, Electron IPC, electron-store, AbortController, axios

---

## 檔案結構

| 檔案                                    | 操作 | 說明                                                        |
| --------------------------------------- | ---- | ----------------------------------------------------------- |
| `src/shared/types/api.ts`               | 修改 | 新增 `JobState`、新 IPC 類型，移除舊 download 類型          |
| `src/main/services/download_service.ts` | 重構 | 加入 `signal`/`onProgress`，移除 IPC 直接發送               |
| `src/main/services/job_manager.ts`      | 新增 | JobManager SSOT                                             |
| `src/main/index.ts`                     | 修改 | 新增 IPC handlers，移除 `download-gallery` handler          |
| `src/preload/index.ts`                  | 修改 | 新增新 API，移除 `downloadGallery`/`onDownloadStatusUpdate` |
| `src/renderer/src/stores/download.ts`   | 重構 | 移除業務邏輯，改為 IPC proxy + 快取                         |

---

## Task 1：更新共用型別 (`src/shared/types/api.ts`)

**Files:**

- Modify: `src/shared/types/api.ts`

- [ ] **Step 1：新增 `JobState` 及相關類型**

在 `src/shared/types/api.ts` 的 `DownloadGallery` 定義之後加入：

```typescript
export interface JobState {
  jobId: string
  title: string
  progress: number
  status: string
  mode: 'running' | 'paused' | 'error' | 'completed' | 'pending'
  galleries: DownloadGallery[]
  isExpanded?: boolean
  isArchive?: boolean
  password?: string
}

export interface AddToQueuePayload {
  jobId: string
  title: string
  galleries: DownloadGallery[]
  isArchive?: boolean
  password?: string
}

export interface DownloadJobUpdatedEvent {
  job: JobState
}
```

- [ ] **Step 2：更新 `SidecarAPI` 介面**

在 `SidecarAPI` 的 `// download` 區塊，**取代**原有的 `downloadGallery` / `onDownloadStatusUpdate`，改為：

```typescript
  // download
  getDownloadsPath: () => Promise<GetDownloadsPathResponse>
  getJobs: () => Promise<JobState[]>
  addToQueue: (payload: AddToQueuePayload) => Promise<void>
  startJob: (jobId: string) => Promise<void>
  pauseJob: (jobId: string) => Promise<void>
  stopJob: (jobId: string) => Promise<void>
  restartJob: (jobId: string) => Promise<void>
  clearFinishedJobs: () => Promise<void>
  onDownloadJobUpdated: (callback: (event: DownloadJobUpdatedEvent) => void) => void
  onArchiveProgress: (callback: (data: ArchiveProgressEvent) => void) => void
```

（移除 `downloadGallery` 與 `onDownloadStatusUpdate`）

- [ ] **Step 3：移除過時類型**

刪除 `DownloadGalleryPayload`、`DownloadGalleryResponse`、`DownloadStatusEvent` 三個 interface。

- [ ] **Step 4：typecheck**

```bash
pnpm run typecheck
```

（此時會有 preload/store 的錯誤，屬預期，確認只有 `api.ts` 自身無錯誤即可繼續）

- [ ] **Step 5：Commit**

```bash
git add src/shared/types/api.ts
git commit -m "feat(types): add JobState and new download IPC types"
```

---

## Task 2：重構 `DownloadService`

**Files:**

- Modify: `src/main/services/download_service.ts`

- [ ] **Step 1：更新函式簽名，加入 signal 與 onProgress**

將 `DownloadOptions` 介面及 `downloadGallery` 方法改為：

```typescript
import { type BrowserWindow, app } from 'electron'
import axios from 'axios'
import * as fs from 'fs'
import { join, dirname } from 'path'
import archiver from 'archiver'
// @ts-ignore
import { registerFormat } from 'archiver'
// @ts-ignore
import zipEncryptable from 'archiver-zip-encryptable'
import { parseTemplatePath } from '@shared/utilities'

export interface DownloadOptions {
  gallery: any
  isArchive?: boolean
  password?: string
  signal: AbortSignal
  onProgress: (data: {
    status?: string
    progress?: number
    level?: 'info' | 'warn' | 'error'
  }) => void
}

export class DownloadService {
  private SIDECAR_URL = 'http://127.0.0.1:8000'

  async downloadGallery(
    options: DownloadOptions,
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const { gallery: meta, isArchive, password, signal, onProgress } = options
    const url = meta.link

    try {
      const targetPath =
        meta.targetPath || parseTemplatePath(meta.targetTemplate || '', meta)
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }

      if (!meta.image_links || meta.image_links.length === 0) {
        onProgress({ status: 'Fetching image list...' })
        const linksResp = await axios.get(`${this.SIDECAR_URL}/gallery/image-links`, {
          params: { url },
          timeout: 5 * 60 * 1000,
          signal,
        })
        meta.image_links = linksResp.data?.image_links ?? []
      }

      fs.writeFileSync(join(targetPath, 'library.json'), JSON.stringify(meta, null, 2))

      const imageLinks: string[] = meta.image_links || []
      const totalImages = imageLinks.length
      let downloadedCount = 0

      for (let i = 0; i < imageLinks.length; i++) {
        if (signal.aborted) break
        const imgUrl = imageLinks[i]
        try {
          const response = await axios.get(`${this.SIDECAR_URL}/image/fetch`, {
            params: { url: imgUrl },
            responseType: 'arraybuffer',
            signal,
          })
          const fileName = `${imgUrl.split('/').pop()}.jpg`
          fs.writeFileSync(join(targetPath, fileName), Buffer.from(response.data))
          downloadedCount++
          onProgress({
            status: `Downloading (${downloadedCount}/${totalImages})`,
            progress: Math.round((downloadedCount / totalImages) * 100),
          })
        } catch (e: any) {
          if (axios.isCancel(e)) throw e
          onProgress({ status: `Image skipped: ${e.message}`, level: 'warn' })
        }
      }

      if (signal.aborted) {
        return { success: false, error: 'aborted' }
      }

      if (downloadedCount === 0 && totalImages > 0) {
        throw new Error('All image downloads failed')
      }

      let finalPath = targetPath
      if (isArchive) {
        onProgress({ status: 'Archiving...', progress: 100 })
        const archivePath = `${targetPath}.zip`
        await this.archiveFolder(targetPath, archivePath, password)
        finalPath = archivePath
      }

      onProgress({ status: 'Completed', progress: 100 })
      return { success: true, path: finalPath }
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return { success: false, error: 'aborted' }
      }
      console.error('[DownloadService] Error:', error)
      onProgress({ status: `Error: ${error.message}`, level: 'error' })
      return { success: false, error: String(error.message || error) }
    }
  }

  private async archiveFolder(
    folderPath: string,
    outputPath: string,
    password?: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(dirname(outputPath))) {
          fs.mkdirSync(dirname(outputPath), { recursive: true })
        }
        const output = fs.createWriteStream(outputPath)
        const archive = archiver(password ? ('zip-encryptable' as any) : 'zip', {
          zlib: { level: 9 },
          forceLocalTime: true,
          ...(password ? { password } : {}),
        })
        output.on('close', () => resolve())
        archive.on('error', (err) => reject(err))
        archive.pipe(output)
        archive.directory(folderPath, false)
        archive.finalize()
      } catch (error) {
        reject(error)
      }
    })
  }
}
```

（移除 `mainWindow` 建構子參數及 `sendProgress` 方法）

- [ ] **Step 2：typecheck**

```bash
pnpm run typecheck
```

（預期 `index.ts` 有錯誤，屬正常）

- [ ] **Step 3：Commit**

```bash
git add src/main/services/download_service.ts
git commit -m "refactor(download): accept signal and onProgress, remove direct IPC"
```

---

## Task 3：新增 `JobManager`

**Files:**

- Create: `src/main/services/job_manager.ts`

- [ ] **Step 1：建立 `src/main/services/job_manager.ts`**

```typescript
import type { BrowserWindow } from 'electron'
import type Store from 'electron-store'
import axios from 'axios'
import { DownloadService } from './download_service'
import { parseTemplatePath } from '@shared/utilities'
import type { JobState, DownloadGallery, AddToQueuePayload } from '@shared/types/api'

const MAX_CONCURRENT_JOBS = 3
const STORE_KEY = 'download.jobs'

export class JobManager {
  private jobs = new Map<string, JobState>()
  private controllers = new Map<string, AbortController>()
  private runningCount = 0
  private downloadService = new DownloadService()
  private mainWindow: BrowserWindow | null
  private store: Store<any>

  constructor(mainWindow: BrowserWindow | null, store: Store<any>) {
    this.mainWindow = mainWindow
    this.store = store
    this.loadFromStore()
  }

  private loadFromStore() {
    const saved = this.store.get(STORE_KEY) as JobState[] | undefined
    if (!saved) return
    for (const job of saved) {
      if (job.mode === 'running') job.mode = 'paused'
      this.jobs.set(job.jobId, job)
    }
  }

  private persist() {
    this.store.set(STORE_KEY, Array.from(this.jobs.values()))
  }

  private pushUpdate(job: JobState) {
    this.persist()
    this.mainWindow?.webContents.send('download-job-updated', { job })
  }

  getJobs(): JobState[] {
    return Array.from(this.jobs.values())
  }

  addJob(payload: AddToQueuePayload) {
    const { jobId, title, galleries, isArchive = false, password = '' } = payload
    const existing = this.jobs.get(jobId)
    if (existing) {
      existing.galleries.push(...galleries)
      existing.status = `Added ${galleries.length} more galleries.`
      this.pushUpdate(existing)
      return
    }
    const job: JobState = {
      jobId,
      title,
      progress: 0,
      status: 'Waiting in queue...',
      mode: 'pending',
      galleries,
      isExpanded: true,
      isArchive,
      password,
    }
    this.jobs.set(jobId, job)
    this.pushUpdate(job)
  }

  async startJob(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job || job.mode === 'running') return
    if (this.runningCount >= MAX_CONCURRENT_JOBS) return
    await this.processJob(job)
  }

  pauseJob(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job) return
    this.controllers.get(jobId)?.abort()
    this.controllers.delete(jobId)
    job.mode = 'paused'
    job.status = 'Paused'
    job.galleries.forEach((g) => {
      if (g.mode === 'running') g.mode = 'paused'
    })
    this.pushUpdate(job)
  }

  stopJob(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job) return
    this.controllers.get(jobId)?.abort()
    this.controllers.delete(jobId)
    job.mode = 'error'
    job.status = 'Terminated by user'
    job.galleries.forEach((g) => {
      if (g.mode !== 'completed') g.mode = 'error'
    })
    this.pushUpdate(job)
  }

  restartJob(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.progress = 0
    job.mode = 'pending'
    job.status = 'Restarting...'
    job.galleries.forEach((g) => {
      g.progress = 0
      g.mode = 'pending'
      g.status = 'Pending...'
      g.image_links = []
    })
    this.pushUpdate(job)
    this.startJob(jobId)
  }

  clearFinishedJobs() {
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.mode === 'completed' || job.mode === 'error') {
        this.jobs.delete(jobId)
      }
    }
    this.persist()
  }

  private async processJob(job: JobState) {
    this.runningCount++
    job.mode = 'running'
    const controller = new AbortController()
    this.controllers.set(job.jobId, controller)

    let completedCount = job.galleries.filter((g) => g.mode === 'completed').length
    const total = job.galleries.length

    for (const gallery of job.galleries) {
      if (controller.signal.aborted) break
      if (gallery.mode === 'completed') continue

      gallery.mode = 'running'
      gallery.status = 'Downloading...'
      this.pushUpdate(job)

      const result = await this.downloadService.downloadGallery({
        gallery,
        isArchive: job.isArchive ?? false,
        password: job.password ?? '',
        signal: controller.signal,
        onProgress: (data) => {
          if (data.progress !== undefined) gallery.progress = data.progress
          if (data.status) gallery.status = data.status
          job.progress = Math.round(
            (job.galleries.filter((g) => g.mode === 'completed').length / total) * 100,
          )
          this.pushUpdate(job)
        },
      })

      if (result.error === 'aborted') {
        break
      } else if (result.success) {
        gallery.mode = 'completed'
        gallery.progress = 100
        gallery.status = 'Completed'
        completedCount++
      } else {
        gallery.mode = 'error'
        gallery.status = result.error ?? 'Failed'
      }

      job.progress = Math.round((completedCount / total) * 100)
      job.status = `Progress: ${completedCount}/${total} galleries.`
      this.pushUpdate(job)
    }

    this.controllers.delete(job.jobId)
    this.runningCount--

    if (job.mode === 'running') {
      if (completedCount === total) {
        job.mode = 'completed'
        job.status = job.isArchive ? 'Finished & Archived' : 'Finished'
      } else {
        job.mode = 'error'
        job.status = `Error: ${completedCount}/${total} galleries completed`
      }
      this.pushUpdate(job)
    }

    this.tryStartNext()
  }

  private tryStartNext() {
    if (this.runningCount >= MAX_CONCURRENT_JOBS) return
    for (const job of this.jobs.values()) {
      if (job.mode === 'pending') {
        this.startJob(job.jobId)
        break
      }
    }
  }
}
```

- [ ] **Step 2：typecheck**

```bash
pnpm run typecheck
```

（預期只剩 `index.ts` 與 `preload` 的錯誤）

- [ ] **Step 3：Commit**

```bash
git add src/main/services/job_manager.ts
git commit -m "feat(job-manager): add JobManager as Node.js download SSOT"
```

---

## Task 4：更新 Electron Main Process IPC (`src/main/index.ts`)

**Files:**

- Modify: `src/main/index.ts`

- [ ] **Step 1：將 `downloadService` 改為 `jobManager`**

在 `index.ts` 頂部的 import 區塊，將 `DownloadService` 替換為 `JobManager`：

```typescript
import { JobManager } from './services/job_manager'
```

（移除 `import { DownloadService } from './services/download_service'`）

- [ ] **Step 2：更新全域宣告與初始化**

找到：

```typescript
let downloadService: DownloadService
```

改為：

```typescript
let jobManager: JobManager
```

找到 `downloadService = new DownloadService(mainWindow)` 的位置（在 `app.whenReady` 或 `createWindow` 附近），改為：

```typescript
jobManager = new JobManager(mainWindow, store)
```

- [ ] **Step 3：移除舊 `download-gallery` handler，新增新 handlers**

移除這段：

```typescript
ipcMain.handle('download-gallery', async (_, payload: DownloadGalleryPayload) => {
  try {
    const result = await downloadService.downloadGallery(payload)
    return result
  } catch (error: any) {
    console.error('[IPC] download-gallery error:', error)
    return { success: false, error: String(error.message || error) }
  }
})
```

新增：

```typescript
ipcMain.handle('get-jobs', async () => {
  return jobManager.getJobs()
})

ipcMain.handle('add-to-queue', async (_, payload: AddToQueuePayload) => {
  jobManager.addJob(payload)
})

ipcMain.handle('start-job', async (_, jobId: string) => {
  await jobManager.startJob(jobId)
})

ipcMain.handle('pause-job', async (_, jobId: string) => {
  jobManager.pauseJob(jobId)
})

ipcMain.handle('stop-job', async (_, jobId: string) => {
  jobManager.stopJob(jobId)
})

ipcMain.handle('restart-job', async (_, jobId: string) => {
  jobManager.restartJob(jobId)
})

ipcMain.handle('clear-finished-jobs', async () => {
  jobManager.clearFinishedJobs()
})
```

- [ ] **Step 4：更新 import 中的型別**

在 `index.ts` 頂部的型別 import，加入 `AddToQueuePayload`，移除 `DownloadGalleryPayload`、`DownloadGalleryResponse`：

```typescript
import type {
  // ... 其他既有的 ...
  AddToQueuePayload,
} from '@shared/types/api'
```

- [ ] **Step 5：typecheck**

```bash
pnpm run typecheck
```

（預期只剩 preload 與 store 的錯誤）

- [ ] **Step 6：Commit**

```bash
git add src/main/index.ts
git commit -m "feat(ipc): wire JobManager IPC handlers, remove download-gallery"
```

---

## Task 5：更新 Preload (`src/preload/index.ts`)

**Files:**

- Modify: `src/preload/index.ts`

- [ ] **Step 1：移除舊方法，新增新方法**

找到 `downloadGallery` 與 `onDownloadStatusUpdate` 兩行，移除：

```typescript
downloadGallery: (payload: DownloadGalleryPayload) => ipcRenderer.invoke('download-gallery', payload),
onDownloadStatusUpdate: (callback: (data: DownloadStatusEvent) => void) =>
  ipcRenderer.on('download-status-update', (_event, value) => callback(value)),
```

新增：

```typescript
getJobs: () => ipcRenderer.invoke('get-jobs'),
addToQueue: (payload: AddToQueuePayload) => ipcRenderer.invoke('add-to-queue', payload),
startJob: (jobId: string) => ipcRenderer.invoke('start-job', jobId),
pauseJob: (jobId: string) => ipcRenderer.invoke('pause-job', jobId),
stopJob: (jobId: string) => ipcRenderer.invoke('stop-job', jobId),
restartJob: (jobId: string) => ipcRenderer.invoke('restart-job', jobId),
clearFinishedJobs: () => ipcRenderer.invoke('clear-finished-jobs'),
onDownloadJobUpdated: (callback: (data: DownloadJobUpdatedEvent) => void) =>
  ipcRenderer.on('download-job-updated', (_event, value) => callback(value)),
```

- [ ] **Step 2：更新 import**

在 preload 頂部 import 區塊，加入 `AddToQueuePayload`、`DownloadJobUpdatedEvent`，移除 `DownloadGalleryPayload`、`DownloadStatusEvent`。

- [ ] **Step 3：typecheck**

```bash
pnpm run typecheck
```

（預期只剩 store 的錯誤）

- [ ] **Step 4：Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): expose JobManager IPC API, remove legacy download API"
```

---

## Task 6：重構 Pinia Download Store

**Files:**

- Modify: `src/renderer/src/stores/download.ts`

- [ ] **Step 1：以新架構完全重寫 `download.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref, onScopeDispose } from 'vue'
import { useLogStore } from '@renderer/stores/logs'
import { parseTemplatePath } from '@shared/utilities'
import type {
  JobState,
  AddToQueuePayload,
  DownloadJobUpdatedEvent,
} from '@shared/types/api'
import type { DraftGallery } from '@renderer/stores/fetch'

export { type JobState }

export const useDownloadStore = defineStore('download', () => {
  const jobs = ref<JobState[]>([])
  const logStore = useLogStore()

  // 初始化同步
  window.api.getJobs().then((serverJobs) => {
    jobs.value = serverJobs
  })

  // 監聽 push event
  const unsubscribe = window.api.onDownloadJobUpdated((data: DownloadJobUpdatedEvent) => {
    const idx = jobs.value.findIndex((j) => j.jobId === data.job.jobId)
    if (idx >= 0) {
      jobs.value[idx] = data.job
    } else {
      jobs.value.unshift(data.job)
    }
  })

  if (typeof unsubscribe === 'function') {
    onScopeDispose(unsubscribe)
  }

  async function getDefaultDownloadsPath() {
    const response = await window.api.getDownloadsPath()
    if (response.success) {
      return response.path + '/{EN_TITLE}'
    }
    return '/{EN_TITLE}'
  }

  function addToQueue(
    jobId: string,
    title: string,
    galleries: DraftGallery[],
    targetTemplate: string,
    isArchive = false,
    password = '',
  ) {
    const mappedGalleries = galleries.map((g) => ({
      ...g,
      targetPath: parseTemplatePath(targetTemplate, g),
      isArchive,
      imagecount: g.imagecount || 0,
      status: 'Pending...',
      progress: 0,
      mode: 'pending' as const,
      password,
    }))

    const payload: AddToQueuePayload = {
      jobId,
      title,
      galleries: mappedGalleries,
      isArchive,
      password,
    }
    window.api.addToQueue(payload)
  }

  function startJob(jobId: string) {
    window.api.startJob(jobId)
  }

  function pauseJob(jobId: string) {
    window.api.pauseJob(jobId)
  }

  function stopJob(jobId: string) {
    window.api.stopJob(jobId)
  }

  function restartJob(jobId: string) {
    window.api.restartJob(jobId)
  }

  function clearFinishedJobs() {
    window.api.clearFinishedJobs()
    jobs.value = jobs.value.filter((j) => j.mode !== 'completed' && j.mode !== 'error')
  }

  return {
    downloadingJobs: jobs,
    getDefaultDownloadsPath,
    addToQueue,
    startJob,
    pauseJob,
    stopJob,
    restartJob,
    clearFinishedJobs,
  }
})
```

- [ ] **Step 2：typecheck**

```bash
pnpm run typecheck
```

預期全部通過（0 errors）。若有錯誤，依訊息逐一修正。

- [ ] **Step 3：Commit**

```bash
git add src/renderer/src/stores/download.ts
git commit -m "refactor(store): simplify download store to IPC proxy and cache"
```

---

## Task 7：移除 `DownloadJob` 型別引用，確認 UI 元件正常

**Files:**

- Modify: 使用 `DownloadJob` 的 Vue 元件（如 `DownloadTab.vue` 或類似檔案）

- [ ] **Step 1：找出所有引用 `DownloadJob` 的元件**

```bash
grep -rn "DownloadJob" src/renderer/src/
```

- [ ] **Step 2：將 `DownloadJob` 替換為 `JobState`**

對所有找到的檔案，將 `import type { DownloadJob }` 改為 `import type { JobState }`，並將型別標註一併替換。

`DownloadJob` 與 `JobState` 的欄位名稱與型別一致（`jobId`, `title`, `progress`, `status`, `mode`, `galleries` 等），直接替換即可。

- [ ] **Step 3：typecheck**

```bash
pnpm run typecheck
```

預期 0 errors。

- [ ] **Step 4：Commit**

```bash
git add -p
git commit -m "refactor(ui): replace DownloadJob with JobState in components"
```

---

## Task 8：手動驗證功能

- [ ] **Step 1：啟動開發環境**

```bash
cd sidecar && make build && cd ..
pnpm run dev
```

- [ ] **Step 2：驗證加入 Queue**

加入一個畫廊到下載佇列，確認 UI 顯示 `pending` 狀態，electron-store 中 `download.jobs` 有寫入。

- [ ] **Step 3：驗證下載開始**

點擊 Start，確認狀態變為 `running`，畫廊進度條更新。

- [ ] **Step 4：驗證暫停**

下載進行中點擊 Pause，確認：

- UI 立即顯示 `paused`
- 網路請求停止（可觀察 sidecar log）

- [ ] **Step 5：驗證繼續**

點擊 Resume，確認從上次進度繼續（已完成的圖片不重複下載）。

- [ ] **Step 6：驗證終止**

下載進行中點擊 Stop，確認狀態變為 `error`，網路請求停止。

- [ ] **Step 7：驗證 App 重啟後狀態恢復**

關閉並重啟 app，確認之前的 jobs 仍顯示（`paused`/`completed`/`error`），沒有殘留 `running` 狀態。
