import { defineStore } from 'pinia'
import { onScopeDispose } from 'vue'
import { useLogStore } from '@renderer/stores/logs'
import { parseTemplatePath } from '@shared/utilities'
import { useElectronStorage } from '@renderer/composables/electron-storage'
import { plainValue } from '@renderer/utilities'
import type {
  DownloadStatusEvent,
  ArchiveProgressEvent,
  DownloadGalleryPayload,
  DownloadGallery,
} from '@shared/types/api'
import type { DraftGallery } from '@renderer/stores/fetch'

export interface DownloadJob {
  jobId: string
  title: string
  progress: number
  status: string
  mode: 'running' | 'paused' | 'error' | 'completed' | 'pending'
  galleries: DownloadGallery[]
  isExpanded?: boolean
  isArchive?: boolean
  password?: string
  archiveProgress?: number
  isArchiving?: boolean
}

const MAX_CONCURRENT_JOBS = 3

export const useDownloadStore = defineStore('download', () => {
  const downloadingJobs = useElectronStorage<DownloadJob[]>('download.jobs', [])
  const logStore = useLogStore()

  const unsubscribeStatus = window.api.onDownloadStatusUpdate(
    (data: DownloadStatusEvent) => {
      for (const job of downloadingJobs.value) {
        const gallery = job.galleries.find((g) => g.link === data.url)
        if (gallery && gallery.mode === 'running') {
          if (data.progress !== undefined) gallery.progress = data.progress
          if (data.status) gallery.status = data.status
          break
        }
      }
    },
  )

  const unsubscribeArchive = window.api.onArchiveProgress(
    (data: ArchiveProgressEvent) => {
      const job = downloadingJobs.value.find((j) => j.jobId === data.jobId)
      if (job) job.archiveProgress = data.progress
    },
  )

  if (typeof unsubscribeStatus === 'function') {
    onScopeDispose(unsubscribeStatus)
  }
  if (typeof unsubscribeArchive === 'function') {
    onScopeDispose(unsubscribeArchive)
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
    const mappedGalleries: DownloadGallery[] = galleries.map((g) => ({
      gid: g.gid || 'unknown',
      title: g.title,
      link: g.link,
      targetPath: parseTemplatePath(targetTemplate, g),
      isArchive,
      imageCount: g.imageCount || 0,
      status: 'Pending...',
      progress: 0,
      mode: 'pending',
      password,
    }))

    const existingJob = downloadingJobs.value.find((j) => j.jobId === jobId)
    if (existingJob) {
      existingJob.galleries = [...existingJob.galleries, ...mappedGalleries]
      existingJob.status = `Added ${galleries.length} more galleries.`
      return
    }

    downloadingJobs.value.unshift({
      jobId,
      title,
      progress: 0,
      status: 'Waiting in queue...',
      mode: 'pending',
      galleries: mappedGalleries,
      isExpanded: true,
      isArchive,
      password,
    })
  }

  async function startJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.jobId === jobId)
    if (job && (job.mode === 'pending' || job.mode === 'paused')) {
      await processDownload(job)
    }
  }

  function pauseJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.jobId === jobId)
    if (job) {
      job.mode = 'paused'
      job.status = 'Paused'
      job.galleries.forEach((g) => {
        if (g.mode === 'running' || g.mode === 'pending') g.mode = 'paused'
      })
    }
  }

  function stopJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.jobId === jobId)
    if (job) {
      job.mode = 'error'
      job.status = 'Terminated by user'
      job.galleries.forEach((g) => {
        if (g.mode !== 'completed') g.mode = 'error'
      })
    }
  }

  function restartJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.jobId === jobId)
    if (job) {
      job.progress = 0
      job.mode = 'pending'
      job.status = 'Restarting...'
      job.galleries.forEach((g) => {
        g.progress = 0
        g.mode = 'pending'
        g.status = 'Pending...'
      })
      startJob(jobId)
    }
  }

  async function startAllJobs() {
    const pendingJobs = downloadingJobs.value.filter(
      (j) => j.mode === 'pending' || j.mode === 'paused',
    )
    const batch = pendingJobs.slice(0, MAX_CONCURRENT_JOBS)
    await Promise.all(batch.map((job) => processDownload(job)))
  }

  async function processDownload(job: DownloadJob) {
    if (job.mode === 'running') return

    job.mode = 'running'
    let completedCount = 0
    const total = job.galleries.length

    for (const gallery of job.galleries) {
      if ((job.mode as string) === 'paused' || (job.mode as string) === 'error') break
      if (gallery.mode === 'completed') {
        completedCount++
        continue
      }

      gallery.mode = 'running'
      gallery.status = 'Downloading...'

      try {
        const payload: DownloadGalleryPayload = {
          gallery,
          isArchive: job.isArchive ?? false,
          password: job.password ?? '',
        }
        const result = await window.api.downloadGallery(plainValue(payload))

        if (result.success) {
          gallery.mode = 'completed'
          gallery.progress = 100
          gallery.status = 'Completed'
          completedCount++
        } else {
          gallery.mode = 'error'
          gallery.status = result.error ?? 'Failed'
          logStore.addLog({
            level: 'error',
            message: `Download Error [${gallery.title}]: ${result.error}`,
          })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        gallery.mode = 'error'
        gallery.status = msg
        logStore.addLog({
          level: 'error',
          message: `IPC Error [${gallery.title}]: ${msg}`,
        })
      }

      job.progress = Math.round((completedCount / total) * 100)
      job.status = `Progress: ${completedCount}/${total} galleries.`
    }

    if (completedCount === total) {
      job.mode = 'completed'
      job.status = job.isArchive ? 'Finished & Archived' : 'Finished'
    } else if ((job.mode as string) !== 'paused' && (job.mode as string) !== 'error') {
      job.mode = 'error'
      job.status = `Error: ${completedCount}/${total} galleries completed`
    }
  }

  function clearFinishedJobs() {
    downloadingJobs.value = downloadingJobs.value.filter(
      (j) => j.mode !== 'completed' && j.mode !== 'error',
    )
  }

  return {
    downloadingJobs,
    getDefaultDownloadsPath,
    addToQueue,
    startJob,
    startAllJobs,
    pauseJob,
    stopJob,
    restartJob,
    clearFinishedJobs,
  }
})
