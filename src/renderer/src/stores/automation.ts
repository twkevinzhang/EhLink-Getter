import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  Collection,
  CreateSchedulePayload,
  JobState,
  ManagedGallery,
  Schedule,
  ScheduleRun,
  ScheduleRunStatus,
  UpdateSchedulePayload,
} from '@shared/types/api'

export type GalleryCollection = Collection
export type { ManagedGallery, Schedule, ScheduleRun, ScheduleRunStatus }

export const useAutomationStore = defineStore('automation', () => {
  const collections = ref<GalleryCollection[]>([])
  const galleries = ref<ManagedGallery[]>([])
  const schedules = ref<Schedule[]>([])
  const runs = ref<ScheduleRun[]>([])
  const activeRuns = ref<Record<string, ScheduleRun>>({})
  const loading = ref(false)
  const error = ref('')
  let listening = false

  const sortedCollections = computed(() =>
    [...collections.value].sort(
      (left, right) =>
        (left.position ?? Number.MAX_SAFE_INTEGER) -
          (right.position ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name, 'zh-Hant'),
    ),
  )

  const uncategorizedGalleries = computed(() => {
    const categorized = new Set(
      collections.value.flatMap((collection) =>
        collection.books.map((entry) => entry.gid),
      ),
    )
    return galleries.value.filter((gallery) => !categorized.has(gallery.gid))
  })

  function upsertRun(run: ScheduleRun) {
    const index = runs.value.findIndex((candidate) => candidate.runId === run.runId)
    if (index >= 0) runs.value[index] = run
    else runs.value.unshift(run)

    if (run.status === 'running') {
      activeRuns.value[run.scheduleId] = run
    } else {
      delete activeRuns.value[run.scheduleId]
      void Promise.all([refreshSchedules(), refreshCollectionsAndGalleries()])
    }
  }

  function listen() {
    if (listening) return
    listening = true
    window.api.onScheduleRunProgress(upsertRun)
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const [nextCollections, nextGalleries, nextSchedules, nextRuns, nextActiveRuns] =
        await Promise.all([
          window.api.listCollections(),
          window.api.listManagedGalleries(),
          window.api.listSchedules(),
          window.api.listScheduleRuns(),
          window.api.getActiveScheduleRuns(),
        ])
      collections.value = nextCollections
      galleries.value = nextGalleries
      schedules.value = nextSchedules
      runs.value = nextRuns
      activeRuns.value = Object.fromEntries(
        nextActiveRuns.map((run) => [run.scheduleId, run]),
      )
      listen()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
    }
  }

  async function refreshCollectionsAndGalleries() {
    const [nextCollections, nextGalleries] = await Promise.all([
      window.api.listCollections(),
      window.api.listManagedGalleries(),
    ])
    collections.value = nextCollections
    galleries.value = nextGalleries
  }

  async function createCollection(name: string) {
    const saved = await window.api.createCollection({ name })
    await refreshCollectionsAndGalleries()
    return saved
  }

  async function updateCollection(collectionId: string, name: string) {
    const saved = await window.api.updateCollection({ collectionId, name })
    await refreshCollectionsAndGalleries()
    return saved
  }

  async function deleteCollection(collectionId: string) {
    await window.api.deleteCollection(collectionId)
    await Promise.all([refreshCollectionsAndGalleries(), refreshSchedules()])
  }

  async function addToCollections(gids: string[], collectionIds: string[]) {
    await window.api.addBooksToCollections({ gids, collectionIds })
    await refreshCollectionsAndGalleries()
  }

  async function removeFromCollection(gid: string, collectionId: string) {
    await window.api.removeBookFromCollection(gid, collectionId)
    await refreshCollectionsAndGalleries()
  }

  async function removeManyFromCollection(gids: string[], collectionId: string) {
    await Promise.all(
      gids.map((gid) => window.api.removeBookFromCollection(gid, collectionId)),
    )
    await refreshCollectionsAndGalleries()
  }

  async function refreshSchedules() {
    schedules.value = await window.api.listSchedules()
  }

  async function createSchedule(payload: CreateSchedulePayload) {
    const saved = await window.api.createSchedule(payload)
    await refreshSchedules()
    return saved
  }

  async function updateSchedule(payload: UpdateSchedulePayload) {
    const saved = await window.api.updateSchedule(payload)
    await refreshSchedules()
    return saved
  }

  async function deleteSchedule(scheduleId: string) {
    await window.api.deleteSchedule(scheduleId)
    schedules.value = schedules.value.filter(
      (schedule) => schedule.scheduleId !== scheduleId,
    )
    runs.value = runs.value.filter((run) => run.scheduleId !== scheduleId)
    delete activeRuns.value[scheduleId]
  }

  async function runNow(scheduleId: string) {
    const run = await window.api.runScheduleNow(scheduleId)
    upsertRun(run)
    return run
  }

  async function pauseScheduleDownloads(scheduleId: string) {
    await window.api.pauseScheduleDownloads(scheduleId)
    await refreshSchedules()
  }

  async function resumeScheduleDownloads(scheduleId: string) {
    await window.api.resumeScheduleDownloads(scheduleId)
    await refreshSchedules()
  }

  function jobsForSchedule(jobs: JobState[], scheduleId: string) {
    return jobs.filter((job) => {
      const linkedJob = job as JobState & {
        scheduleId?: string
        sourceScheduleId?: string
      }
      return (
        linkedJob.scheduleId === scheduleId || linkedJob.sourceScheduleId === scheduleId
      )
    })
  }

  return {
    collections,
    sortedCollections,
    galleries,
    uncategorizedGalleries,
    schedules,
    runs,
    activeRuns,
    loading,
    error,
    load,
    refreshCollectionsAndGalleries,
    createCollection,
    updateCollection,
    deleteCollection,
    addToCollections,
    removeFromCollection,
    removeManyFromCollection,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    runNow,
    pauseScheduleDownloads,
    resumeScheduleDownloads,
    jobsForSchedule,
  }
})
