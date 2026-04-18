import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { spawn, type ChildProcess } from 'child_process'
import axios from 'axios'
import { LibraryService } from './services/library_service'
import { SchedulerService } from './services/scheduler_service'
import { DownloadService } from './services/download_service'
import Store from 'electron-store'
// @ts-ignore
import { registerFormat } from 'archiver'
// @ts-ignore
import zipEncryptable from 'archiver-zip-encryptable'
import { File as MegaFile } from 'megajs'
import { downloadsPath, libraryPath } from './services/utilties'
import { CONFIG_STORE_KEY } from '../shared/src/utilities'

// Register the encryptable zip format
registerFormat('zip-encryptable', zipEncryptable)

const store = new Store<any>()

let mainWindow: BrowserWindow
let sidecarProcess: ChildProcess | null = null
let downloadService: DownloadService

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
        } else if (json.type === 'progress') {
          mainWindow?.webContents.send('python-progress', json)
        } else if (json.type === 'task_complete') {
          mainWindow?.webContents.send('python-task-complete', json)
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

  downloadService = new DownloadService(mainWindow)
  const schedulerService = new SchedulerService(mainWindow, downloadService)
  schedulerService.start()
  // Store in global for IPC access
  ;(global as any).schedulerService = schedulerService

  // Sync config to sidecar once it's up
  const unsubscribe = store.onDidChange(CONFIG_STORE_KEY, (newValue, oldValue) => {
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

// IPC Handlers
ipcMain.handle('select-save-path', async () => {
  const { canceled, filePath } = await require('electron').dialog.showSaveDialog(
    mainWindow,
    {
      title: 'Select Output CSV Path',
      defaultPath: 'gallery-links.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    },
  )
  if (!canceled) {
    return filePath
  }
  return null
})

ipcMain.handle('check-library-exists', async () => {
  return fs.existsSync(libraryPath())
})

ipcMain.handle('download-library', async () => {
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

ipcMain.handle('search-library', async (_, payload: any) => {
  try {
    const libPath = libraryPath()
    const service = new LibraryService(libPath)
    const rawResults = await service.findMultipleLinks(payload.keywords, 1000, true)

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
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fetch-page', async (_, payload: { url: string; next?: string }) => {
  try {
    const response = await axios.get(`${SIDECAR_URL}/tasks/fetch`, {
      params: { url: payload.url, next: payload.next },
    })
    return response.data
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('check-sidecar-health', async () => {
  try {
    const response = await axios.get(`${SIDECAR_URL}/health`, {
      timeout: 2000,
    })
    return { success: response.data.status === 'ok' }
  } catch (error) {
    1
    return { success: false }
  }
})

ipcMain.handle('save-json', async (_, payload: { path: string; data: any }) => {
  try {
    const actualPath = payload.path
    // Ensure directory exists
    if (!fs.existsSync(join(dirname(actualPath)))) {
      fs.mkdirSync(join(dirname(actualPath)), { recursive: true })
    }

    fs.writeFileSync(actualPath, JSON.stringify(payload.data, null, 2), 'utf8')
    return { status: 'saved', path: actualPath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('read-json', async (_, payload: { path: string }) => {
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
})

ipcMain.handle('save-csv', async (_, payload: { path: string; results: any[] }) => {
  try {
    const csvContent = [
      '\ufeffTitle,Link', // Add UTF-8 BOM for Excel compatibility
      ...payload.results.map((item) => {
        // Escape double quotes and wrap in quotes
        const escapedTitle = `"${(item.title || '').replace(/"/g, '""')}"`
        const escapedLink = `"${(item.link || '').replace(/"/g, '""')}"`
        return `${escapedTitle},${escapedLink}`
      }),
    ].join('\n')

    // Replace {execute_started_at} if present (though frontend might have handled it)
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

    // Ensure directory exists
    if (!fs.existsSync(join(dirname(actualPath)))) {
      fs.mkdirSync(join(dirname(actualPath)), { recursive: true })
    }

    fs.writeFileSync(actualPath, csvContent, 'utf8')
    return { status: 'saved', path: actualPath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('login-ehentai', async () => {
  const authWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: `temp_login_${Date.now()}`, // 使用隨機 partition 確保環境絕對乾淨
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

ipcMain.handle(
  'download-image',
  async (_, payload: { url: string; savePath: string }) => {
    try {
      const response = await axios.get(`${SIDECAR_URL}/image/fetch`, {
        params: { url: payload.url },
        responseType: 'arraybuffer', // Important for binary data
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

ipcMain.handle(
  'download-gallery',
  async (_, payload: { gallery: any; isArchive?: boolean; password?: string }) => {
    try {
      const result = await downloadService.downloadGallery(payload)
      // Final guard against any non-clonable data in the response
      return JSON.parse(JSON.stringify(result))
    } catch (error: any) {
      console.error('[IPC] download-gallery error:', error)
      return { success: false, error: error.message }
    }
  },
)

ipcMain.handle('trigger-scheduler-task', async (_, taskId: string) => {
  // @ts-ignore - We need access to the schedulerService instance
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
})

ipcMain.handle('open-folder', async (_, folderPath: string) => {
  if (folderPath) {
    shell.openPath(folderPath)
  } else {
    shell.openPath(downloadsPath())
  }
})

ipcMain.handle('get-downloads-path', async () => {
  return downloadsPath()
})

ipcMain.handle('electron-store-get', async (_, key: string) => {
  return store.get(key)
})

ipcMain.handle('electron-store-set', async (_, key: string, val: any) => {
  store.set(key, val)
})

ipcMain.handle('select-directory', async () => {
  const { canceled, filePaths } = await require('electron').dialog.showOpenDialog(
    mainWindow,
    {
      properties: ['openDirectory'],
    },
  )
  if (!canceled) {
    return filePaths[0]
  }
  return null
})
