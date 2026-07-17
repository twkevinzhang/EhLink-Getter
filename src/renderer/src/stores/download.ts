import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  DownloadQueueItem,
  ManualDownloadPayload,
  ManualDownloadResult,
} from '@shared/types/api'

export { type DownloadQueueItem }

export type ManualDownloadBatchResult = ManualDownloadResult

export const useDownloadStore = defineStore('download', () => {
  const queueItems = ref<DownloadQueueItem[]>([])
  const loading = ref(false)
  const error = ref('')
  const pendingActions = ref<Record<string, boolean>>({})

  const activeItems = computed(() =>
    queueItems.value.filter((item) =>
      ['pending', 'running', 'paused'].includes(item.mode),
    ),
  )
  const finishedItems = computed(() =>
    queueItems.value.filter((item) =>
      ['completed', 'error', 'stopped'].includes(item.mode),
    ),
  )

  window.api.onDownloadQueueItemUpdated(({ item }) => {
    const index = queueItems.value.findIndex(
      (candidate) => candidate.queueItemId === item.queueItemId,
    )
    if (index >= 0) queueItems.value[index] = item
    else queueItems.value.unshift(item)
  })

  function message(reason: unknown) {
    return reason instanceof Error ? reason.message : String(reason)
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      queueItems.value = await window.api.getQueueItems()
      return queueItems.value
    } catch (reason) {
      error.value = message(reason)
      return queueItems.value
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

  function isActionPending(queueItemId: string, action?: string) {
    if (action) return Boolean(pendingActions.value[`${queueItemId}:${action}`])
    return Object.keys(pendingActions.value).some((key) =>
      key.startsWith(`${queueItemId}:`),
    )
  }

  function startItem(queueItemId: string) {
    return runAction(`${queueItemId}:start`, () => window.api.startQueueItem(queueItemId))
  }

  function pauseItem(queueItemId: string) {
    return runAction(`${queueItemId}:pause`, () => window.api.pauseQueueItem(queueItemId))
  }

  function stopItem(queueItemId: string) {
    return runAction(`${queueItemId}:stop`, () => window.api.stopQueueItem(queueItemId))
  }

  function restartItem(queueItemId: string) {
    return runAction(`${queueItemId}:restart`, () =>
      window.api.restartQueueItem(queueItemId),
    )
  }

  async function removeItem(queueItemId: string) {
    await runAction(`${queueItemId}:remove`, () =>
      window.api.removeQueueItem(queueItemId),
    )
    queueItems.value = queueItems.value.filter((item) => item.queueItemId !== queueItemId)
  }

  async function clearFinishedItems() {
    await runAction('global:clear', () => window.api.clearFinishedQueueItems())
    queueItems.value = queueItems.value.filter(
      (item) => !['completed', 'error', 'stopped'].includes(item.mode),
    )
  }

  async function startAll() {
    const resumable = queueItems.value.filter((item) =>
      ['pending', 'paused'].includes(item.mode),
    )
    const outcomes = await Promise.allSettled(
      resumable.map((item) => startItem(item.queueItemId)),
    )
    const failed = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    )
    if (failed) throw failed.reason
  }

  async function pauseAll() {
    const running = queueItems.value.filter((item) => item.mode === 'running')
    const outcomes = await Promise.allSettled(
      running.map((item) => pauseItem(item.queueItemId)),
    )
    const failed = outcomes.find(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    )
    if (failed) throw failed.reason
  }

  function stopAll() {
    return runAction('global:stop', () => window.api.stopAllQueueItems())
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
    queueItems,
    activeItems,
    finishedItems,
    loading,
    error,
    pendingActions,
    load,
    isActionPending,
    startItem,
    pauseItem,
    stopItem,
    restartItem,
    removeItem,
    clearFinishedItems,
    startAll,
    pauseAll,
    stopAll,
    manualDownloadBatch,
  }
})
