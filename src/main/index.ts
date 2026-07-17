import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, type ChildProcess } from 'child_process'
import axios from 'axios'
import { Worker } from 'worker_threads'
import path from 'path'
// @ts-ignore
import { registerFormat } from 'archiver'
// @ts-ignore
import zipEncryptable from 'archiver-zip-encryptable'
import { File as MegaFile } from 'megajs'
import { SchedulerService } from '@main/services/scheduler_service'
import { ScheduleRunnerService } from '@main/services/schedule_runner_service'
import { JobManager } from '@main/services/job_manager'
import { WorkspaceRepository } from '@main/services/workspace_repository'
import Store from 'electron-store'
import { LibrarySqliteService } from '@main/services/library_sqlite_service'
import { downloadsPath, libraryPath, libraryDbPath } from '@main/services/utilties'
import {
  CONFIG_STORE_KEY,
  DEFAULT_CONFIG,
  WORKSPACE_DATA_DIR,
  WORKSPACE_PATH_STORE_KEY,
} from '@shared/utilities'
import {
  type AppConfig,
  type SearchLibraryPayload,
  type SearchLibraryResponse,
  type AddToQueueItemPayload,
  type ManualDownloadPayload,
  type ManualDownloadResult,
  type GetConfigResponse,
  type SaveConfigResponse,
  type CheckSidecarHealthResponse,
  type LoginEHentaiResponse,
  type DownloadLibraryResponse,
  type CheckLibraryExistsResponse,
  type LibraryProgressEvent,
  type WorkspaceResponse,
  type WorkspaceSettings,
  type WorkspaceSettingsResponse,
  type CreateSchedulePayload,
  type UpdateSchedulePayload,
  type Schedule,
  type ScheduleRun,
  type Collection,
  type CreateCollectionPayload,
  type UpdateCollectionPayload,
  type AddBooksToCollectionsPayload,
  type ManagedGallery,
} from '@shared/types/api'

// Register the encryptable zip format
registerFormat('zip-encryptable', zipEncryptable)

const store = new Store<any>()

let mainWindow: BrowserWindow
let sidecarProcess: ChildProcess | null = null
let jobManager: JobManager
let schedulerService: SchedulerService
let scheduleRunnerService: ScheduleRunnerService

const workspaceRepository = new WorkspaceRepository(app.getVersion())
const savedWorkspacePath = store.get(WORKSPACE_PATH_STORE_KEY) as string | undefined
if (savedWorkspacePath) {
  try {
    workspaceRepository.activate(savedWorkspacePath)
  } catch {
    store.delete(WORKSPACE_PATH_STORE_KEY)
  }
}

// The legacy scheduler is intentionally discarded instead of migrated.
store.delete('scheduler.tasks')

const requestedSidecarPort = Number(process.env.SIDECAR_PORT)
const SIDECAR_PORT =
  Number.isInteger(requestedSidecarPort) && requestedSidecarPort > 0
    ? requestedSidecarPort
    : 8000
const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`

const isQuitting = false

function getRuntimeIconPath(): string {
  return is.dev
    ? join(app.getAppPath(), 'resources', 'icon.png')
    : join(process.resourcesPath, 'icon.png')
}

function startSidecar() {
  let sidecarExecutable = ''

  if (is.dev) {
    sidecarExecutable = join(app.getAppPath(), 'sidecar', 'sidecar')
    // Ensure binary is executable (on macOS/Linux)
    if (process.platform !== 'win32' && fs.existsSync(sidecarExecutable)) {
      try {
        fs.chmodSync(sidecarExecutable, 0o755)
      } catch {
        console.error('Failed to set executable bit on sidecar')
      }
    }
  } else {
    // In production, use the bundled binary
    sidecarExecutable = join(
      process.resourcesPath,
      'sidecar',
      process.platform === 'win32' ? 'sidecar.exe' : 'sidecar',
    )
  }

  if (!fs.existsSync(sidecarExecutable)) {
    console.error(`Sidecar executable not found at: ${sidecarExecutable}`)
    return
  }

  sidecarProcess = spawn(sidecarExecutable, [], {
    env: { ...process.env, SIDECAR_PORT: SIDECAR_PORT.toString() },
    shell: false, // Go binary doesn't need a shell usually
  })

  sidecarProcess.stdout?.on('data', (data) => {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      // Filter out noisy health check logs
      if (trimmedLine.includes('GET /health')) continue

      try {
        const json = JSON.parse(trimmedLine)
        if (json.type === 'log') {
          mainWindow?.webContents.send('python-log', json)
        }
      } catch {
        // Not JSON, just regular log
        mainWindow?.webContents.send('python-log', {
          level: 'info',
          message: trimmedLine,
        })
      }
    }
  })

  sidecarProcess.stderr?.on('data', (data) => {
    const message = data.toString().trim()
    if (!message) return

    console.error(`Sidecar error: ${message}`)
    mainWindow?.webContents.send('python-log', {
      level: 'error',
      message: message,
    })
  })

  sidecarProcess.on('close', (code) => {
    console.log(`Sidecar process exited with code ${code}`)
    if (code !== 0 && !isQuitting) {
      // Auto restart in production if needed
      // startSidecar()
    }
  })
}

function createWindow(): void {
  const iconPath = getRuntimeIconPath()

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // Open DevTools in development mode for debugging
    if (is.dev) {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function currentConfig(): AppConfig {
  if (workspaceRepository.root) {
    const settings = workspaceRepository.getSettings()
    return {
      cookies: settings.cookies,
      proxies: settings.proxies,
      scan_thread_cnt: settings.scan_thread_cnt,
      download_thread_cnt: settings.download_thread_cnt,
    }
  }
  return {
    ...DEFAULT_CONFIG,
    ...((store.get(CONFIG_STORE_KEY) as Partial<AppConfig> | undefined) ?? {}),
  }
}

async function syncConfigToSidecar(config: AppConfig, retries = 5): Promise<void> {
  try {
    await axios.post(`${SIDECAR_URL}/config`, config)
  } catch {
    if (retries > 0) {
      setTimeout(() => void syncConfigToSidecar(config, retries - 1), 2000)
    } else {
      console.error('Failed to sync config to sidecar after retries')
    }
  }
}

function notifyWorkspaceUpdated(): void {
  mainWindow?.webContents.send('workspace-updated', workspaceRepository.getState())
}

function startScheduleScheduler(catchUp = false): void {
  if (!workspaceRepository.root || !schedulerService || !scheduleRunnerService) return
  schedulerService.startSchedules(
    () => workspaceRepository.listSchedules(),
    async (scheduleId, trigger) => {
      await scheduleRunnerService.run(scheduleId, trigger)
      notifyWorkspaceUpdated()
    },
    catchUp,
  )
}

function activateWorkspace(folderPath: string): WorkspaceResponse {
  try {
    const hasActiveDownloads = jobManager
      ?.getQueueItems()
      .some((item) => ['pending', 'running', 'paused'].includes(item.mode))
    if (hasActiveDownloads || scheduleRunnerService?.getActiveRuns().length) {
      throw new Error('請先停止進行中的下載與排程，再變更工作資料夾')
    }
    const settingsPath = join(folderPath, WORKSPACE_DATA_DIR, 'settings.json')
    const isNewWorkspace = !fs.existsSync(settingsPath)
    const fallbackConfig = currentConfig()
    workspaceRepository.activate(folderPath)
    if (isNewWorkspace) workspaceRepository.saveSettings(fallbackConfig)
    store.set(WORKSPACE_PATH_STORE_KEY, workspaceRepository.root)
    jobManager?.setWorkspace(workspaceRepository)
    startScheduleScheduler(true)
    void syncConfigToSidecar(currentConfig())
    notifyWorkspaceUpdated()
    return { success: true, state: workspaceRepository.getState() }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('tw.kevinzhang.ehlinkgetter')

  if (process.platform === 'darwin' && is.dev) {
    const iconPath = getRuntimeIconPath()
    if (fs.existsSync(iconPath)) {
      app.dock.setIcon(iconPath)
    } else {
      console.warn(`Development Dock icon not found at: ${iconPath}`)
    }
  }

  if (is.dev) {
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
  }

  startSidecar()
  createWindow()

  jobManager = new JobManager(
    mainWindow,
    workspaceRepository.root ? workspaceRepository : undefined,
  )
  schedulerService = new SchedulerService()
  scheduleRunnerService = new ScheduleRunnerService(workspaceRepository, jobManager)
  scheduleRunnerService.setOnProgress((run) => {
    mainWindow?.webContents.send('schedule-run-progress', run)
  })
  startScheduleScheduler(true)

  // Settings saved before a workspace is selected still live in electron-store.
  store.onDidChange(CONFIG_STORE_KEY, (newValue) => {
    if (!workspaceRepository.root && newValue) {
      void syncConfigToSidecar(newValue as AppConfig)
    }
  })
  void syncConfigToSidecar(currentConfig())

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  schedulerService?.stop()
  if (sidecarProcess) {
    sidecarProcess.kill()
  }
})

// --- IPC Handlers ---

// --- Config Module ---
ipcMain.handle('get-config', async (): Promise<GetConfigResponse> => {
  try {
    return { success: true, config: currentConfig() }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle(
  'save-config',
  async (_, config: AppConfig): Promise<SaveConfigResponse> => {
    try {
      if (workspaceRepository.root) workspaceRepository.saveSettings(config)
      else store.set(CONFIG_STORE_KEY, config)
      await syncConfigToSidecar(config)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  },
)

ipcMain.handle('check-sidecar-health', async (): Promise<CheckSidecarHealthResponse> => {
  try {
    const response = await axios.get(`${SIDECAR_URL}/health`, {
      timeout: 2000,
    })
    return { success: response.data.status === 'ok' }
  } catch {
    return { success: false }
  }
})

ipcMain.handle('login-ehentai', async (): Promise<LoginEHentaiResponse> => {
  const authWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: `temp_login_${Date.now()}`,
    },
  })

  const loginUrl = 'https://forums.e-hentai.org/index.php?act=Login&CODE=00'
  authWindow.loadURL(loginUrl)

  return new Promise((resolve) => {
    let completed = false
    const checkCookies = async () => {
      if (completed) return
      const cookies = await authWindow.webContents.session.cookies.get({
        domain: '.e-hentai.org',
      })
      const required = ['ipb_member_id', 'ipb_pass_hash']
      const hasAll = required.every((name) => cookies.some((c) => c.name === name))

      if (hasAll) {
        completed = true
        const cookieString = JSON.stringify(cookies)
        authWindow.close()
        resolve({ success: true, cookies: cookieString })
      }
    }

    authWindow.webContents.on('did-finish-load', checkCookies)
    authWindow.on('close', () => {
      if (!completed) {
        completed = true
        resolve({ success: false, error: 'Window closed by user' })
      }
    })
  })
})

// --- Library Module ---
ipcMain.handle(
  'search-library',
  async (_, payload: SearchLibraryPayload): Promise<SearchLibraryResponse> => {
    try {
      const dbPath = libraryDbPath()
      const service = new LibrarySqliteService(dbPath)

      try {
        const keywords = payload.keywords
          .split(' ')
          .map((q) => q.trim().toLowerCase())
          .filter((q) => q.length > 0)

        const titleTokens = keywords.filter((q) => !q.includes(':'))
        const tagQueries = keywords.filter((q) => q.includes(':'))

        const results = service.search(titleTokens, tagQueries, {
          minRating: payload.minRating,
          includeExpunged: payload.includeExpunged,
        })

        return { results }
      } finally {
        service.close()
      }
    } catch (error: any) {
      return { results: [], error: error.message }
    }
  },
)

ipcMain.handle('check-library-exists', async (): Promise<CheckLibraryExistsResponse> => {
  try {
    const dbPath = libraryDbPath()
    if (!fs.existsSync(dbPath)) return { exists: false }

    // ⚠️ 只有 _meta.status = 'ready' 才算真正完成（排除 import 中途失敗的殘留）
    const db = new (require('better-sqlite3'))(dbPath, { readonly: true })
    try {
      const row = db.prepare(`SELECT value FROM _meta WHERE key = 'status'`).get() as
        | { value: string }
        | undefined
      return { exists: row?.value === 'ready' }
    } finally {
      db.close()
    }
  } catch {
    return { exists: false }
  }
})

ipcMain.handle('download-library', async (): Promise<DownloadLibraryResponse> => {
  const url = 'https://mega.nz/folder/oh1U0SIA#WBUcf3PaOvrfIF238fnbTg'
  const jsonPath = libraryPath()
  const dbPath = libraryDbPath()

  const sendProgress = (event: LibraryProgressEvent) => {
    mainWindow?.webContents.send('library-progress', event)
  }

  try {
    // ── Phase 1：下載 library.json ────────────────────────────
    const folder = MegaFile.fromURL(url)
    await folder.loadAttributes()

    // @ts-ignore
    const file = folder.children.find((f: any) => f.name === 'gdata.json')
    if (!file) throw new Error('File gdata.json not found in the MEGA folder')

    await new Promise<void>((resolve, reject) => {
      const stream = file.download({})
      const writeStream = fs.createWriteStream(jsonPath)

      stream.on('progress', (info: { bytesLoaded: number; bytesTotal: number }) => {
        const progress =
          info.bytesTotal > 0 ? Math.round((info.bytesLoaded / info.bytesTotal) * 100) : 0
        sendProgress({ phase: 'download', progress })
      })

      stream.pipe(writeStream)
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
      stream.on('error', reject)
    })

    // ── Phase 2 & 3：Worker Thread 執行 SQLite 匯入與建索引 ───
    // ⚠️ Worker 路徑：electron-vite build 後 worker 與 index.js 同目錄（out/main/）
    const workerPath = path.join(__dirname, 'library_import_worker.js')

    await new Promise<void>((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: { jsonPath, dbPath },
      })

      worker.on('message', (msg: LibraryProgressEvent) => {
        sendProgress(msg)
      })

      worker.on('error', reject)

      worker.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Library import worker exited with code ${code}`))
      })
    })

    return { success: true, path: dbPath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-folder', async (_, folderPath: string): Promise<void> => {
  if (folderPath) {
    shell.openPath(folderPath)
  } else if (workspaceRepository.root) {
    shell.openPath(workspaceRepository.root)
  } else {
    shell.openPath(downloadsPath())
  }
})

// --- Download Module ---
ipcMain.handle('get-queue-items', async () => {
  return jobManager.getQueueItems()
})

ipcMain.handle(
  'manual-download-batch',
  async (_, payload: ManualDownloadPayload): Promise<ManualDownloadResult> => {
    if (!workspaceRepository.root) throw new Error('開始下載前必須先設定工作資料夾')

    const settings = workspaceRepository.getSettings()
    const collectionIds = [...new Set(payload.collectionIds)]
    const result: ManualDownloadResult = {
      queued: 0,
      merged: 0,
      existing: 0,
      invalid: [],
    }

    for (const [index, rawValue] of payload.urls.entries()) {
      const rawUrl = rawValue.trim()
      if (!rawUrl) continue

      const match = rawUrl.match(
        /^https:\/\/e-hentai\.org\/g\/([1-9]\d*)\/([a-zA-Z0-9]+)\/$/,
      )
      if (!match) {
        result.invalid.push(rawUrl)
        continue
      }

      const [, gid, token] = match
      const active = jobManager
        .getQueueItems()
        .find(
          (item) =>
            ['pending', 'running', 'paused'].includes(item.mode) && item.gid === gid,
        )
      if (active) {
        const merged = jobManager.addQueueItem({
          queueItemId: active.queueItemId,
          gallery: { ...active, token, collectionIds },
          origin: 'manual',
          targetCollectionIds: collectionIds,
        })
        if (merged?.mode === 'pending') {
          void jobManager.startQueueItem(merged.queueItemId)
        }
        result.merged++
        continue
      }

      const managed = workspaceRepository.getGallery(gid)
      if (managed) {
        if (collectionIds.length) {
          workspaceRepository.addBookToCollections(gid, collectionIds)
        }
        result.existing++
        continue
      }

      try {
        const response = await axios.get(`${SIDECAR_URL}/gallery/metadata`, {
          params: { url: rawUrl },
        })
        const metadata = response.data
        const metadataGid = String(metadata.gid)
        const metadataToken = String(metadata.token ?? '')
        if (metadataGid !== gid || !metadataToken)
          throw new Error('Gallery metadata 不符')

        const link = `https://e-hentai.org/g/${gid}/${metadataToken}/`
        const title = metadata.title || metadata.title_jpn || link
        const item = jobManager.addQueueItem({
          queueItemId: `manual-${gid}-${Date.now()}-${index}`,
          gallery: {
            gid,
            token: metadataToken,
            title,
            link,
            targetPath: '',
            isArchive: settings.isArchive,
            imagecount: Number.parseInt(metadata.filecount, 10) || 0,
            status: 'Waiting in queue...',
            progress: 0,
            mode: 'pending',
            collectionIds,
          },
          isArchive: settings.isArchive,
          password: settings.archivePassword,
          origin: 'manual',
          targetCollectionIds: collectionIds,
        })
        if (!item) throw new Error('無法建立下載項目')
        result.queued++
        if (item.mode === 'pending') void jobManager.startQueueItem(item.queueItemId)
      } catch {
        result.invalid.push(rawUrl)
      }
    }

    return result
  },
)

ipcMain.handle('add-to-queue-item', async (_, payload: AddToQueueItemPayload) => {
  jobManager.addQueueItem(payload)
})

ipcMain.handle('start-queue-item', async (_, queueItemId: string) => {
  void jobManager.startQueueItem(queueItemId).catch((error) => {
    console.error(`Failed to start download queue item ${queueItemId}:`, error)
  })
})

ipcMain.handle('pause-queue-item', async (_, queueItemId: string) => {
  jobManager.pauseQueueItem(queueItemId)
})

ipcMain.handle('stop-queue-item', async (_, queueItemId: string) => {
  jobManager.stopQueueItem(queueItemId)
})

ipcMain.handle('stop-all-queue-items', async () => {
  jobManager.stopAll()
})

ipcMain.handle('restart-queue-item', async (_, queueItemId: string) => {
  jobManager.restartQueueItem(queueItemId)
})

ipcMain.handle('remove-queue-item', async (_, queueItemId: string) => {
  jobManager.removeQueueItem(queueItemId)
})

ipcMain.handle('clear-finished-queue-items', async () => {
  jobManager.clearFinishedQueueItems()
})

// --- Storage Module ---
// --- Workspace Module ---
ipcMain.handle(
  'get-workspace-state',
  (): WorkspaceResponse => ({ success: true, state: workspaceRepository.getState() }),
)

ipcMain.handle('select-workspace', async (): Promise<WorkspaceResponse> => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) {
    return { success: true, state: workspaceRepository.getState() }
  }
  return activateWorkspace(result.filePaths[0])
})

ipcMain.handle('get-workspace-settings', (): WorkspaceSettingsResponse => {
  try {
    return { success: true, settings: workspaceRepository.getSettings() }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
})

ipcMain.handle(
  'save-workspace-settings',
  async (_, settings: WorkspaceSettings): Promise<WorkspaceSettingsResponse> => {
    try {
      const saved = workspaceRepository.saveSettings(settings)
      await syncConfigToSidecar(saved)
      notifyWorkspaceUpdated()
      return { success: true, settings: saved }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
)

ipcMain.handle('list-managed-galleries', (): ManagedGallery[] =>
  workspaceRepository.listGalleries(),
)

// --- Collection Module ---
ipcMain.handle('list-collections', (): Collection[] =>
  workspaceRepository.listCollections(),
)
ipcMain.handle(
  'create-collection',
  (_, payload: CreateCollectionPayload): Collection =>
    workspaceRepository.createCollection(payload),
)
ipcMain.handle(
  'update-collection',
  (_, payload: UpdateCollectionPayload): Collection =>
    workspaceRepository.updateCollection(payload),
)
ipcMain.handle('delete-collection', (_, collectionId: string): void => {
  workspaceRepository.deleteCollection(collectionId)
  startScheduleScheduler()
  notifyWorkspaceUpdated()
})
ipcMain.handle(
  'add-books-to-collections',
  (_, payload: AddBooksToCollectionsPayload): { added: number; existing: number } => {
    let added = 0
    let existing = 0
    for (const gid of [...new Set(payload.gids)]) {
      const result = workspaceRepository.addBookToCollections(gid, payload.collectionIds)
      added += result.added
      existing += result.existing
    }
    notifyWorkspaceUpdated()
    return { added, existing }
  },
)
ipcMain.handle(
  'remove-book-from-collection',
  (_, payload: { gid: string; collectionId: string }): void => {
    workspaceRepository.removeBookFromCollection(payload.gid, payload.collectionId)
    notifyWorkspaceUpdated()
  },
)

// --- Scheduler Module ---
ipcMain.handle('list-schedules', (): Schedule[] => workspaceRepository.listSchedules())
ipcMain.handle('list-schedule-runs', (_, scheduleId?: string): ScheduleRun[] =>
  workspaceRepository.listScheduleRuns(scheduleId),
)
ipcMain.handle('get-active-schedule-runs', (): ScheduleRun[] =>
  scheduleRunnerService.getActiveRuns(),
)
ipcMain.handle('create-schedule', (_, payload: CreateSchedulePayload): Schedule => {
  if (!SchedulerService.validateCron(payload.cronExpression))
    throw new Error('Cron string 無效')
  const schedule = workspaceRepository.createSchedule(payload)
  startScheduleScheduler()
  return schedule
})
ipcMain.handle('update-schedule', (_, payload: UpdateSchedulePayload): Schedule => {
  if (
    payload.cronExpression !== undefined &&
    !SchedulerService.validateCron(payload.cronExpression)
  ) {
    throw new Error('Cron string 無效')
  }
  const schedule = workspaceRepository.updateSchedule(payload)
  startScheduleScheduler()
  return schedule
})
ipcMain.handle('delete-schedule', async (_, scheduleId: string): Promise<void> => {
  await scheduleRunnerService.cancel(scheduleId)
  workspaceRepository.deleteSchedule(scheduleId)
  startScheduleScheduler()
})
ipcMain.handle(
  'run-schedule-now',
  (_, scheduleId: string): Promise<ScheduleRun> =>
    scheduleRunnerService.run(scheduleId, 'manual'),
)
ipcMain.handle(
  'pause-schedule-downloads',
  (_, scheduleId: string): Schedule => scheduleRunnerService.pauseDownloads(scheduleId),
)
ipcMain.handle(
  'resume-schedule-downloads',
  (_, scheduleId: string): Schedule => scheduleRunnerService.resumeDownloads(scheduleId),
)
