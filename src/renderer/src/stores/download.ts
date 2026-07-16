import { defineStore } from 'pinia'
import { ref, onScopeDispose } from 'vue'
import type {
  JobState,
  AddToQueuePayload,
  DownloadJobUpdatedEvent,
} from '@shared/types/api'
import type { DraftGallery } from '@renderer/stores/fetch'

export { type JobState }

export const useDownloadStore = defineStore('download', () => {
  const jobs = ref<JobState[]>([])

  // 初始化同步
  window.api
    .getJobs()
    .then((serverJobs) => {
      for (const sJob of serverJobs) {
        const idx = jobs.value.findIndex((j) => j.jobId === sJob.jobId)
        if (idx >= 0) {
          jobs.value[idx] = sJob
        } else {
          jobs.value.push(sJob)
        }
      }
    })
    .catch(() => undefined)

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

  async function addToQueue(
    jobId: string,
    title: string,
    galleries: DraftGallery[],
    isArchive = false,
    password = '',
    collectionIds: string[] = [],
  ) {
    const mappedGalleries = galleries.map(
      (g) =>
        ({
          ...g,
          isArchive,
          imagecount: g.imagecount || 0,
          status: 'Pending...',
          progress: 0,
          mode: 'pending' as const,
          password,
          collectionIds,
        }) as AddToQueuePayload['galleries'][number],
    )

    const payload: AddToQueuePayload = {
      jobId,
      title,
      galleries: mappedGalleries,
      isArchive,
      password,
      origin: 'manual',
      targetCollectionIds: collectionIds,
    }
    await window.api.addToQueue(payload)
    void window.api.startJob(jobId)
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

  function removeJob(jobId: string) {
    window.api.removeJob(jobId)
    jobs.value = jobs.value.filter((j) => j.jobId !== jobId)
  }

  function clearFinishedJobs() {
    window.api.clearFinishedJobs()
    jobs.value = jobs.value.filter(
      (j) => j.mode !== 'completed' && j.mode !== 'error' && j.mode !== 'stopped',
    )
  }

  return {
    downloadingJobs: jobs,
    addToQueue,
    startJob,
    pauseJob,
    stopJob,
    restartJob,
    removeJob,
    clearFinishedJobs,
  }
})
