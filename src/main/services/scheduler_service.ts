import { type BrowserWindow } from 'electron'
import Store from 'electron-store'
import axios from 'axios'
import { DownloadService } from './download_service'

interface ScheduledTask {
  id: string
  link: string
  fromPage: number
  toPage: number | string
  scheduleTime: string
  templatePath?: string
  isArchive?: boolean
  archivePassword?: string
  lastRun?: string
  status: 'enabled' | 'disabled' | 'running'
  executionCount: number
  downloadedCount: number
}

export class SchedulerService {
  private store: Store
  private timer: NodeJS.Timeout | null = null
  private mainWindow: BrowserWindow | null = null
  private downloadService = new DownloadService()
  private SIDECAR_URL = 'http://127.0.0.1:8000'

  constructor(mainWindow: BrowserWindow | null) {
    this.store = new Store()
    this.mainWindow = mainWindow
  }

  start() {
    console.log('Scheduler Service starting...')
    // Check every minute
    this.timer = setInterval(() => this.checkTasks(), 60 * 1000)
    this.checkTasks() // Initial check
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async checkTasks() {
    const now = new Date()
    const currentHourMin = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const tasks = (this.store.get('scheduler.tasks') as ScheduledTask[]) || []

    for (const task of tasks) {
      if (task.status === 'enabled' && task.scheduleTime === currentHourMin) {
        // Prevent running multiple times in the same minute
        const lastRunDate = task.lastRun ? new Date(task.lastRun) : null
        if (
          lastRunDate &&
          lastRunDate.toDateString() === now.toDateString() &&
          lastRunDate.getHours() === now.getHours() &&
          lastRunDate.getMinutes() === now.getMinutes()
        ) {
          continue
        }

        console.log(`Running scheduled task: ${task.id} at ${currentHourMin}`)
        this.runTask(task)
      }
    }
  }

  private async runTask(task: ScheduledTask) {
    try {
      // Update status to running
      this.updateTaskState(task.id, { status: 'running' })
      this.logToRenderer(`Starting scheduled task: ${task.link}`)

      let allItems: any[] = []
      let nextToken: string | undefined =
        task.fromPage > 1 ? (task.fromPage - 1).toString() : undefined
      let pageCount = task.fromPage - 1
      const maxPages = typeof task.toPage === 'number' ? task.toPage : Infinity

      // 1. Fetch gallery list
      while (pageCount < maxPages) {
        pageCount++
        this.logToRenderer(`[Scheduler] Fetching page ${pageCount}...`)

        try {
          const response = await axios.get(`${this.SIDECAR_URL}/tasks/fetch`, {
            params: { url: task.link, next: nextToken },
          })
          const result = response.data
          if (result && result.items) {
            allItems = [...allItems, ...result.items]
            nextToken = result.next
          } else {
            break
          }
          if (!nextToken) break
        } catch (err: any) {
          this.logToRenderer(`[Scheduler] Fetch Error: ${err.message}`, 'error')
          break
        }
      }

      this.logToRenderer(
        `[Scheduler] Found ${allItems.length} galleries. Starting downloads...`,
      )

      // 2. Download galleries using centralised DownloadService
      let successDownloaded = 0
      for (const item of allItems) {
        try {
          // Centralized path resolution and downloading
          const controller = new AbortController()
          const result = await this.downloadService.downloadGallery({
            gallery: {
              ...item,
              targetTemplate: task.templatePath || '',
            },
            isArchive: task.isArchive,
            password: task.archivePassword,
            signal: controller.signal,
            onProgress: (data) => {
              if (data.status) {
                this.logToRenderer(`[Scheduler] ${data.status}`)
              }
            },
          })

          if (result.success) {
            successDownloaded++
            this.updateTaskState(task.id, {
              downloadedCount: task.downloadedCount + successDownloaded,
            })
          }
        } catch (err: any) {
          this.logToRenderer(
            `[Scheduler] Failed to download ${item.title}: ${err.message}`,
            'error',
          )
        }
      }

      // 3. Finalize
      this.updateTaskState(task.id, {
        status: 'enabled',
        executionCount: task.executionCount + 1,
        lastRun: new Date().toLocaleString(),
      })
      this.logToRenderer(
        `[Scheduler] Task finished. Downloaded ${successDownloaded} new items.`,
      )
    } catch (error: any) {
      console.error('Scheduled task error:', error)
      this.updateTaskState(task.id, { status: 'enabled' })
      this.logToRenderer(`[Scheduler] Task ${task.id} failed: ${error.message}`, 'error')
    }
  }

  private updateTaskState(id: string, updates: Partial<ScheduledTask>) {
    const tasks = (this.store.get('scheduler.tasks') as ScheduledTask[]) || []
    const idx = tasks.findIndex((t) => t.id === id)
    if (idx !== -1) {
      tasks[idx] = { ...tasks[idx], ...updates }
      this.store.set('scheduler.tasks', tasks)
      // Notify renderer if needed
      this.mainWindow?.webContents.send('scheduler-updated', tasks)
    }
  }

  private logToRenderer(message: string, level: 'info' | 'error' = 'info') {
    this.mainWindow?.webContents.send('python-log', {
      level,
      message,
      timestamp: new Date().toISOString(),
      type: 'log',
    })
  }
}
