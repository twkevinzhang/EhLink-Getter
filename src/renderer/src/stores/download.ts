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
