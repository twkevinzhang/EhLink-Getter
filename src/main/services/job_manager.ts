import type { BrowserWindow } from 'electron'
import type Store from 'electron-store'
import { DownloadService } from './download_service'
import type { JobState, AddToQueuePayload } from '@shared/types/api'

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

    this.runningCount--
    this.controllers.delete(job.jobId)

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
