import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  JobState,
  ManualDownloadPayload,
  ManualDownloadResult,
} from '@shared/types/api'

export { type JobState }

export type ManualDownloadBatchResult = ManualDownloadResult

export const useDownloadStore = defineStore('download', () => {
  const jobs = ref<JobState[]>([])
  const loading = ref(false)
  const error = ref('')
  const pendingActions = ref<Record<string, boolean>>({})

  const activeJobs = computed(() =>
    jobs.value.filter((job) => ['pending', 'running', 'paused'].includes(job.mode)),
  )
  const finishedJobs = computed(() =>
    jobs.value.filter((job) => ['completed', 'error', 'stopped'].includes(job.mode)),
  )

  const unsubscribe = window.api.onDownloadJobUpdated((data) => {
    const index = jobs.value.findIndex((job) => job.jobId === data.job.jobId)
    if (index >= 0) {
      const expanded = jobs.value[index].isExpanded
      jobs.value[index] = { ...data.job, isExpanded: expanded }
    } else {
      jobs.value.unshift(data.job)
    }
  })

  if (typeof unsubscribe === 'function') onScopeDispose(unsubscribe)

  function message(reason: unknown) {
    return reason instanceof Error ? reason.message : String(reason)
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      jobs.value = await window.api.getJobs()
      return jobs.value
    } catch (reason) {
      error.value = message(reason)
      return jobs.value
    } finally {
      loading.value = false
    }
  }

  async function runAction(key: string, action: () => Promise<void>) {
    pendingActions.value[key] = true
    error.value = ''
    try {
      await action()
    } catch (reason) {
      error.value = message(reason)
      throw reason
    } finally {
      delete pendingActions.value[key]
    }
  }

  function isActionPending(jobId: string, action?: string) {
    if (action) return Boolean(pendingActions.value[`${jobId}:${action}`])
    return Object.keys(pendingActions.value).some((key) => key.startsWith(`${jobId}:`))
  }

  function startJob(jobId: string) {
    return runAction(`${jobId}:start`, () => window.api.startJob(jobId))
  }

  function pauseJob(jobId: string) {
    return runAction(`${jobId}:pause`, () => window.api.pauseJob(jobId))
  }

  function stopJob(jobId: string) {
    return runAction(`${jobId}:stop`, () => window.api.stopJob(jobId))
  }

  function restartJob(jobId: string) {
    return runAction(`${jobId}:restart`, () => window.api.restartJob(jobId))
  }

  async function removeJob(jobId: string) {
    await runAction(`${jobId}:remove`, () => window.api.removeJob(jobId))
    jobs.value = jobs.value.filter((job) => job.jobId !== jobId)
  }

  async function clearFinishedJobs() {
    await runAction('global:clear', () => window.api.clearFinishedJobs())
    jobs.value = jobs.value.filter(
      (job) => !['completed', 'error', 'stopped'].includes(job.mode),
    )
  }

  async function startAll() {
    const resumable = jobs.value.filter((job) => ['pending', 'paused'].includes(job.mode))
    const outcomes = await Promise.allSettled(resumable.map((job) => startJob(job.jobId)))
    const failed = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    )
    if (failed) throw failed.reason
  }

  async function pauseAll() {
    const running = jobs.value.filter((job) => job.mode === 'running')
    const outcomes = await Promise.allSettled(running.map((job) => pauseJob(job.jobId)))
    const failed = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    )
    if (failed) throw failed.reason
  }

  function stopAll() {
    return runAction('global:stop', () => window.api.stopAllJobs())
  }

  async function manualDownloadBatch(payload: ManualDownloadPayload) {
    pendingActions.value['global:manual'] = true
    error.value = ''
    try {
      const result = await window.api.manualDownloadBatch(payload)
      await load()
      return result
    } catch (reason) {
      error.value = message(reason)
      throw reason
    } finally {
      delete pendingActions.value['global:manual']
    }
  }

  return {
    downloadingJobs: jobs,
    activeJobs,
    finishedJobs,
    loading,
    error,
    pendingActions,
    load,
    isActionPending,
    startJob,
    pauseJob,
    stopJob,
    restartJob,
    removeJob,
    clearFinishedJobs,
    startAll,
    pauseAll,
    stopAll,
    manualDownloadBatch,
  }
})
