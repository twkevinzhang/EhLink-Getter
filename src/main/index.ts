import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, type ChildProcess } from 'child_process'
import axios from 'axios'
import { LibraryService } from '@main/services/library_service'
import { SchedulerService } from '@main/services/scheduler_service'
import { JobManager } from '@main/services/job_manager'
import Store from 'electron-store'
// @ts-ignore
import { registerFormat } from 'archiver'
// @ts-ignore
import zipEncryptable from 'archiver-zip-encryptable'
import { File as MegaFile } from 'megajs'
import { downloadsPath, libraryPath } from '@main/services/utilties'
import { CONFIG_STORE_KEY } from '@shared/utilities'
import {
  type AppConfig,
  type SearchLibraryPayload,
  type SearchLibraryResponse,
  type FetchPageResponse,
  type FetchedItem,
  type AddToQueuePayload,
  type TriggerSchedulerResponse,
  type GetConfigResponse,
  type SaveConfigResponse,
  type CheckSidecarHealthResponse,
  type LoginEHentaiResponse,
  type SaveCSVResponse,
  type SaveJSONResponse,
  type ReadJSONResponse,
  type DownloadImageResponse,
  type DownloadLibraryResponse,
  type CheckLibraryExistsResponse,
  type SelectDirectoryResponse,
  type SelectSavePathResponse,
  type GetDownloadsPathResponse,
  type FetchGalleryResponse,
} from '@shared/types/api'

// Register the encryptable zip format
registerFormat('zip-encryptable', zipEncryptable)

const store = new Store<any>()

let mainWindow: BrowserWindow
let sidecarProcess: ChildProcess | null = null
let jobManager: JobManager

const SIDECAR_PORT = 8000
const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`

const isQuitting = false

function startSidecar() {
  let sidecarExecutable = ''

  if (is.dev) {
    sidecarExecutable = join(app.getAppPath(), 'sidecar', 'sidecar')
    // Ensure binary is executable (on macOS/Linux)
    if (process.platform !== 'win32' && fs.existsSync(sidecarExecutable)) {
      try {
        fs.chmodSync(sidecarExecutable, 0o755)
      } catch (e) {
        console.error('Failed to set executable bit on sidecar:', e)
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
      } catch (e) {
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
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux'
      ? { icon: join(__dirname, '../../resources/icon.png') }
      : {}),
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('tw.kevinzhang.ehlinkgetter')

  if (is.dev) {
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
  }

  startSidecar()
  createWindow()

  jobManager = new JobManager(mainWindow, store)
  const schedulerService = new SchedulerService(mainWindow)
  schedulerService.start()
  // Store in global for IPC access
  ;(global as any).schedulerService = schedulerService

  // Sync config to sidecar once it's up
  store.onDidChange(CONFIG_STORE_KEY, (newValue, oldValue) => {
    console.log(`${CONFIG_STORE_KEY} changed:`, { oldValue, newValue })
    syncConfig(newValue, 5)
  })
  const syncConfig = async (newConfig: any, retries: number) => {
    try {
      await axios.post(`${SIDECAR_URL}/config`, newConfig)
      console.log('Config synced to sidecar')
    } catch (e) {
      if (retries > 0) {
        setTimeout(() => syncConfig(newConfig, retries - 1), 2000)
      } else {
        console.error('Failed to sync config to sidecar after retries')
      }
    }
  }

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
  if (sidecarProcess) {
    sidecarProcess.kill()
  }
})

// --- IPC Handlers ---

// --- Config Module ---
ipcMain.handle('get-config', async (): Promise<GetConfigResponse> => {
  try {
    const config = store.get(CONFIG_STORE_KEY) as AppConfig
    return { success: true, config }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle(
  'save-config',
  async (_, config: AppConfig): Promise<SaveConfigResponse> => {
    try {
      store.set(CONFIG_STORE_KEY, config)
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
  } catch (error) {
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
      const libPath = libraryPath()
      const service = new LibraryService(libPath)
      const rawResults = await service.findMultipleLinks(
        payload.keywords.split(' '),
        1000,
        true,
      )

      const filteredResults = rawResults.map((item) => {
        const itemFiltered: any = {}
        for (const field of payload.fields) {
          if (field === 'link') {
            itemFiltered.link = `https://e-hentai.org/g/${item.gid}/${item.token}/`
          } else if (item[field] !== undefined) {
            itemFiltered[field] = item[field]
          }
        }
        return itemFiltered
      })

      return { results: filteredResults }
    } catch (error: any) {
      return { results: [], error: error.message }
    }
  },
)

ipcMain.handle('check-library-exists', async (): Promise<CheckLibraryExistsResponse> => {
  try {
    const exists = fs.existsSync(libraryPath())
    return { success: true, exists }
  } catch (error: any) {
    return { success: false, exists: false }
  }
})

ipcMain.handle('download-library', async (): Promise<DownloadLibraryResponse> => {
  const url = 'https://mega.nz/folder/oh1U0SIA#WBUcf3PaOvrfIF238fnbTg'
  const targetPath = libraryPath()

  try {
    const folder = MegaFile.fromURL(url)
    await folder.loadAttributes()

    // @ts-ignore
    const file = folder.children.find((f: any) => f.name === 'gdata.json')

    if (!file) {
      throw new Error('File gdata.json not found in the MEGA folder')
    }

    return new Promise((resolve, reject) => {
      const stream = file.download({})
      const writeStream = fs.createWriteStream(targetPath)

      stream.on('progress', (info) => {
        mainWindow?.webContents.send('download-progress', {
          loaded: info.bytesLoaded,
          total: info.bytesTotal,
        })
      })

      stream.pipe(writeStream)

      writeStream.on('finish', () => {
        resolve({ success: true, path: targetPath })
      })

      writeStream.on('error', (err) => {
        reject(err)
      })

      stream.on('error', (err) => {
        reject(err)
      })
    })
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-folder', async (_, folderPath: string): Promise<void> => {
  if (folderPath) {
    shell.openPath(folderPath)
  } else {
    shell.openPath(downloadsPath())
  }
})

// --- Fetch Module ---
ipcMain.handle(
  'fetch-page',
  async (_, payload: { url: string; next?: string }): Promise<FetchPageResponse> => {
    try {
      const response = await axios.get(`${SIDECAR_URL}/tasks/fetch`, {
        params: { url: payload.url, next: payload.next },
      })
      return response.data
    } catch (error: any) {
      return { items: [], error: error.message }
    }
  },
)

ipcMain.handle('fetch-gallery', async (_, url: string): Promise<FetchGalleryResponse> => {
  try {
    const response = await axios.get(`${SIDECAR_URL}/gallery/metadata`, {
      params: { url },
    })
    const g = response.data
    const gidStr = String(g.gid)
    const link = `https://e-hentai.org/g/${gidStr}/${g.token}/`
    return {
      item: {
        gid: gidStr,
        token: g.token,
        title: g.title || g.title_jpn || link,
        link,
        imagecount: parseInt(g.filecount, 10) || undefined,
        thumb: g.thumb,
        category: g.category,
        rating: g.rating,
        posted: g.posted,
      },
    }
  } catch (error: any) {
    return { error: error.message }
  }
})

ipcMain.handle(
  'save-csv',
  async (
    _,
    payload: { path: string; results: FetchedItem[] },
  ): Promise<SaveCSVResponse> => {
    try {
      const csvContent = [
        '\ufeffTitle,Link',
        ...payload.results.map((item) => {
          const escapedTitle = `"${(item.title || '').replace(/"/g, '""')}"`
          const escapedLink = `"${(item.link || '').replace(/"/g, '""')}"`
          return `${escapedTitle},${escapedLink}`
        }),
      ].join('\n')

      let actualPath = payload.path
      if (actualPath.includes('{execute_started_at}')) {
        const now = new Date()
        const timestamp =
          now.getFullYear() +
          String(now.getMonth() + 1).padStart(2, '0') +
          String(now.getDate()).padStart(2, '0') +
          '_' +
          String(now.getHours()).padStart(2, '0') +
          String(now.getMinutes()).padStart(2, '0') +
          String(now.getSeconds()).padStart(2, '0')
        actualPath = actualPath.replace('{execute_started_at}', timestamp)
      }

      if (!fs.existsSync(join(dirname(actualPath)))) {
        fs.mkdirSync(join(dirname(actualPath)), { recursive: true })
      }

      fs.writeFileSync(actualPath, csvContent, 'utf8')
      return { status: 'saved', path: actualPath }
    } catch (error: any) {
      return { status: 'error', path: '', error: error.message }
    }
  },
)

ipcMain.handle(
  'save-json',
  async (_, payload: { path: string; data: unknown }): Promise<SaveJSONResponse> => {
    try {
      const actualPath = payload.path
      if (!fs.existsSync(join(dirname(actualPath)))) {
        fs.mkdirSync(join(dirname(actualPath)), { recursive: true })
      }

      fs.writeFileSync(actualPath, JSON.stringify(payload.data, null, 2), 'utf8')
      return { status: 'saved', path: actualPath }
    } catch (error: any) {
      return { status: 'error', path: '', error: error.message }
    }
  },
)

ipcMain.handle(
  'read-json',
  async (_, payload: { path: string }): Promise<ReadJSONResponse> => {
    try {
      const actualPath = payload.path
      if (!fs.existsSync(actualPath)) {
        return { success: false, error: 'File not found', code: 'ENOENT' }
      }
      const content = fs.readFileSync(actualPath, 'utf8')
      return { success: true, data: JSON.parse(content) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  },
)

ipcMain.handle(
  'download-image',
  async (
    _,
    payload: { url: string; savePath: string },
  ): Promise<DownloadImageResponse> => {
    try {
      const response = await axios.get(`${SIDECAR_URL}/image/fetch`, {
        params: { url: payload.url },
        responseType: 'arraybuffer',
      })

      const actualPath = payload.savePath
      const targetDir = dirname(actualPath)

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      fs.writeFileSync(actualPath, Buffer.from(response.data))
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  },
)

ipcMain.handle('select-directory', async (): Promise<SelectDirectoryResponse> => {
  try {
    const { canceled, filePaths } = await require('electron').dialog.showOpenDialog(
      mainWindow,
      {
        properties: ['openDirectory'],
      },
    )
    if (!canceled) {
      return { success: true, path: filePaths[0] }
    }
    return { success: true, path: null }
  } catch (error: any) {
    return { success: false, path: null }
  }
})

ipcMain.handle('select-save-path', async (): Promise<SelectSavePathResponse> => {
  try {
    const { canceled, filePath } = await require('electron').dialog.showSaveDialog(
      mainWindow,
      {
        title: 'Select Output CSV Path',
        defaultPath: 'gallery-links.csv',
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      },
    )
    if (!canceled) {
      return { success: true, path: filePath }
    }
    return { success: true, path: null }
  } catch (error: any) {
    return { success: false, path: null }
  }
})

// --- Download Module ---
ipcMain.handle('get-downloads-path', async (): Promise<GetDownloadsPathResponse> => {
  try {
    return { success: true, path: downloadsPath() }
  } catch (error: any) {
    return { success: false, path: '' }
  }
})

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

// --- Storage Module ---
ipcMain.handle('electron-store-get', async <T = unknown>(_, key: string): Promise<T> => {
  return store.get(key) as T
})

ipcMain.handle('electron-store-set', async (_, key: string, val: any): Promise<void> => {
  store.set(key, val)
})

// --- Scheduler Module ---
ipcMain.handle(
  'trigger-scheduler-task',
  async (_, taskId: string): Promise<TriggerSchedulerResponse> => {
    // @ts-ignore
    const schedulerService = (global as any).schedulerService
    if (schedulerService) {
      const tasks = (schedulerService.store.get('scheduler.tasks') as any[]) || []
      const task = tasks.find((t) => (t.taskId || t.id) === taskId)
      if (task) {
        schedulerService.runTask(task)
        return { success: true }
      }
      return { success: false, error: 'Task not found' }
    }
    return { success: false, error: 'Scheduler service not initialized' }
  },
)
