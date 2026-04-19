import { defineStore } from 'pinia'
import { onScopeDispose } from 'vue'
import { useLogStore } from '@renderer/stores/logs'
import { parseTemplatePath } from '@shared/utilities'
import { useElectronStorage } from '@renderer/composables/electron-storage'
import { plainValue } from '@renderer/utilities'
import type {
  ArchiveProgressEvent,
  DownloadGallery,
  DownloadJobUpdatedEvent,
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

  const unsubscribeStatus = window.api.onDownloadJobUpdated(
    (data: DownloadJobUpdatedEvent) => {
      const jobIndex = downloadingJobs.value.findIndex((j) => j.jobId === data.job.jobId)
      if (jobIndex !== -1) {
        downloadingJobs.value[jobIndex] = {
          ...downloadingJobs.value[jobIndex],
          progress: data.job.progress,
          status: data.job.status,
          mode: data.job.mode as DownloadJob['mode'],
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
      ...g,
      targetPath: parseTemplatePath(targetTemplate, g),
      isArchive,
      imagecount: g.imagecount || 0,
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

    try {
      await window.api.startJob(job.jobId)
      job.mode = 'running'
      job.status = 'Processing...'
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      job.mode = 'error'
      job.status = msg
      logStore.addLog({
        level: 'error',
        message: `IPC Error [${job.title}]: ${msg}`,
      })
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
