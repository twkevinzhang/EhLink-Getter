import { randomUUID } from 'crypto'
import axios from 'axios'
import type {
  DownloadGallery,
  FetchPageResponse,
  FetchedItem,
  Schedule,
  ScheduleRun,
  ScheduleRunCounters,
  ScheduleRunTrigger,
} from '@shared/types/api'
import type { JobManager } from './job_manager'
import type { WorkspaceRepository } from './workspace_repository'

interface ScheduleApi {
  fetchPage(url: string, next?: string): Promise<FetchPageResponse>
}

type ScheduleApiFactory = () => ScheduleApi
type ProgressCallback = (run: ScheduleRun) => void

interface ActiveScheduleRun {
  run: ScheduleRun
  cancelled: boolean
  promise: Promise<ScheduleRun>
}

const ACTIVE_JOB_MODES = new Set(['pending', 'running', 'paused'])

function cloneRun(run: ScheduleRun): ScheduleRun {
  return {
    ...run,
    snapshot: { ...run.snapshot },
    counters: { ...run.counters },
  }
}

function createSidecarApi(): ScheduleApi {
  const sidecarUrl = `http://127.0.0.1:${process.env.SIDECAR_PORT || '8000'}`
  return {
    async fetchPage(url, next) {
      const response = await axios.get(`${sidecarUrl}/tasks/fetch`, {
        params: { url, next },
      })
      return response.data as FetchPageResponse
    },
  }
}

export class ScheduleRunnerService {
  private activeRuns = new Map<string, ActiveScheduleRun>()
  private onProgress?: ProgressCallback

  constructor(
    private workspace: WorkspaceRepository,
    private jobManager: JobManager,
    private apiFactory: ScheduleApiFactory = createSidecarApi,
  ) {}

  setOnProgress(callback: ProgressCallback): void {
    this.onProgress = callback
  }

  getActiveRuns(): ScheduleRun[] {
    return [...this.activeRuns.values()].map(({ run }) => cloneRun(run))
  }

  run(scheduleId: string, trigger: ScheduleRunTrigger): Promise<ScheduleRun> {
    const active = this.activeRuns.get(scheduleId)
    if (active) return active.promise

    const schedule = this.workspace.getSchedule(scheduleId)
    if (!schedule) return Promise.reject(new Error('找不到排程'))

    const now = new Date().toISOString()
    const counters: ScheduleRunCounters = {
      discovered: 0,
      queued: 0,
      existingGalleryAdded: 0,
      merged: 0,
      ignored: 0,
    }
    const run: ScheduleRun = {
      runId: randomUUID(),
      scheduleId,
      trigger,
      status: 'running',
      snapshot: {
        name: schedule.name,
        monitorUrl: schedule.monitorUrl,
        canonicalUrl: schedule.canonicalUrl,
        query: schedule.query,
        cronExpression: schedule.cronExpression,
        pageLimit: schedule.pageLimit || 3,
        targetCollectionId: schedule.targetCollectionId,
      },
      currentPage: 0,
      counters,
      startedAt: now,
      updatedAt: now,
    }
    const activeRun: ActiveScheduleRun = {
      run,
      cancelled: false,
      promise: Promise.resolve(run),
    }
    activeRun.promise = this.execute(activeRun, schedule).finally(() => {
      if (this.activeRuns.get(scheduleId)?.run.runId === run.runId) {
        this.activeRuns.delete(scheduleId)
      }
    })
    this.activeRuns.set(scheduleId, activeRun)
    this.emit(run)
    return activeRun.promise
  }

  async cancel(scheduleId: string): Promise<void> {
    const active = this.activeRuns.get(scheduleId)
    if (!active) return
    active.cancelled = true
    await active.promise.catch(() => undefined)
  }

  private async execute(
    active: ActiveScheduleRun,
    schedule: Schedule,
  ): Promise<ScheduleRun> {
    const { run } = active
    const settings = this.workspace.getSettings()
    const api = this.apiFactory()
    const seen = new Set<string>()
    let next: string | undefined

    try {
      for (let page = 1; page <= run.snapshot.pageLimit; page++) {
        this.assertNotCancelled(active)
        run.currentPage = page
        run.totalPages = run.snapshot.pageLimit
        this.emit(run)

        const result = await api.fetchPage(run.snapshot.monitorUrl, next)
        if (result.error) throw new Error(result.error)

        for (const rawItem of result.items ?? []) {
          this.assertNotCancelled(active)
          const item = this.normalizeItem(rawItem)
          if (!item || seen.has(item.gid)) {
            run.counters.ignored++
            continue
          }
          seen.add(item.gid)
          run.currentGid = item.gid
          run.counters.discovered++
          this.emit(run)

          const existingGallery = this.workspace.getGallery(item.gid)
          if (existingGallery) {
            if (!run.snapshot.targetCollectionId) {
              run.counters.ignored++
              continue
            }
            const mutation = this.workspace.addGalleryToCollections(item.gid, [
              run.snapshot.targetCollectionId,
            ])
            if (mutation.added > 0) run.counters.existingGalleryAdded++
            else run.counters.ignored++
            continue
          }

          const existingJob = this.jobManager
            .getJobs()
            .find(
              (job) =>
                ACTIVE_JOB_MODES.has(job.mode) &&
                job.galleries.some((gallery) => gallery.gid === item.gid),
            )
          const gallery = this.toDownloadGallery(item, run.snapshot.targetCollectionId)
          const job = this.jobManager.addJob({
            jobId: `schedule-${run.runId}-${item.gid}`,
            title: item.title,
            galleries: [gallery],
            isArchive: settings.isArchive,
            password: settings.archivePassword,
            origin: 'schedule',
            scheduleId: schedule.scheduleId,
            scheduleRunId: run.runId,
            targetCollectionIds: run.snapshot.targetCollectionId
              ? [run.snapshot.targetCollectionId]
              : [],
          })
          if (existingJob) run.counters.merged++
          else run.counters.queued++
          if (job?.mode === 'pending') void this.jobManager.startJob(job.jobId)
        }

        next = result.next
        if (!next) {
          run.totalPages = page
          break
        }
      }

      run.status = 'success'
      run.completedAt = new Date().toISOString()
      run.currentGid = undefined
      const message = `掃描 ${run.counters.discovered} 本，新下載 ${run.counters.queued} 本，加入 Collection ${run.counters.existingGalleryAdded} 本，合併 ${run.counters.merged} 本，略過 ${run.counters.ignored} 本`
      this.workspace.markScheduleRun(schedule.scheduleId, 'success', message)
      this.emit(run)
      return cloneRun(run)
    } catch (reason) {
      const cancelled = reason instanceof Error && reason.message === 'SCHEDULE_CANCELLED'
      run.status = cancelled ? 'cancelled' : 'error'
      run.error = cancelled
        ? undefined
        : reason instanceof Error
          ? reason.message
          : String(reason)
      run.completedAt = new Date().toISOString()
      run.currentGid = undefined
      this.workspace.markScheduleRun(
        schedule.scheduleId,
        cancelled ? 'cancelled' : 'error',
        cancelled ? '排程執行已取消' : (run.error ?? '排程執行失敗'),
      )
      this.emit(run)
      if (!cancelled) throw reason
      return cloneRun(run)
    }
  }

  private normalizeItem(item: FetchedItem): FetchedItem | null {
    const gid = String(item.gid ?? '').trim()
    const token = String(item.token ?? '').trim()
    if (!/^\d+$/.test(gid) || !token || !item.link) return null
    return { ...item, gid, token }
  }

  private toDownloadGallery(
    item: FetchedItem,
    collectionId: string | null,
  ): DownloadGallery {
    return {
      gid: item.gid,
      token: item.token,
      title: item.title,
      link: item.link,
      targetPath: '',
      isArchive: false,
      imagecount: item.imagecount ?? 0,
      status: 'Waiting in queue...',
      progress: 0,
      mode: 'pending',
      collectionIds: collectionId ? [collectionId] : [],
    }
  }

  private emit(run: ScheduleRun): void {
    run.updatedAt = new Date().toISOString()
    this.workspace.saveScheduleRun(run)
    try {
      this.onProgress?.(cloneRun(run))
    } catch {
      // Renderer progress updates must not interrupt schedule execution.
    }
  }

  private assertNotCancelled(active: ActiveScheduleRun): void {
    if (active.cancelled) throw new Error('SCHEDULE_CANCELLED')
  }
}
