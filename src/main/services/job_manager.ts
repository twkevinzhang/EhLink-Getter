import type { BrowserWindow } from 'electron'
import type {
  AddToQueuePayload,
  DownloadGallery,
  JobState,
  ManagedGalleryStatus,
} from '@shared/types/api'
import { DownloadService } from './download_service'
import type { WorkspaceRepository } from './workspace_repository'

const MAX_CONCURRENT_JOBS = 3
const ACTIVE_MODES = new Set<JobState['mode']>(['pending', 'running', 'paused'])

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

/**
 * The only entry point for downloads. Jobs are persisted in the active
 * workspace and gallery paths are always resolved by WorkspaceRepository.
 */
export class JobManager {
  private jobs = new Map<string, JobState>()
  private controllers = new Map<string, AbortController>()
  private runningCount = 0
  private downloadService = new DownloadService()
  private workspace: WorkspaceRepository | null = null

  constructor(
    private mainWindow: BrowserWindow | null,
    workspace?: WorkspaceRepository,
  ) {
    if (workspace) this.setWorkspace(workspace)
  }

  setWorkspace(workspace: WorkspaceRepository | null): void {
    this.workspace = workspace
    this.jobs.clear()
    if (!workspace) return
    for (const saved of workspace.loadJobs()) {
      const job: JobState = {
        ...saved,
        mode: saved.mode === 'running' ? 'paused' : saved.mode,
        galleries: saved.galleries.map((gallery) => ({
          ...gallery,
          mode: gallery.mode === 'running' ? 'paused' : gallery.mode,
        })),
        sourceScheduleIds: unique([...(saved.sourceScheduleIds ?? []), saved.scheduleId]),
        hasManualSource: saved.hasManualSource ?? saved.origin !== 'schedule',
      }
      this.jobs.set(job.jobId, job)
    }
    this.persist()
  }

  private requireWorkspace(): WorkspaceRepository {
    if (!this.workspace) throw new Error('請先設定工作資料夾')
    return this.workspace
  }

  private persist(): void {
    if (this.workspace) this.workspace.saveJobs(Array.from(this.jobs.values()))
  }

  private pushUpdate(job: JobState): void {
    this.persist()
    this.mainWindow?.webContents.send('download-job-updated', { job })
  }

  getJobs(): JobState[] {
    return Array.from(this.jobs.values())
  }

  addJob(payload: AddToQueuePayload): JobState | null {
    this.requireWorkspace()
    const payloadCollections = unique(payload.targetCollectionIds ?? [])
    const pending: DownloadGallery[] = []
    const mergedJobs = new Set<JobState>()
    const seen = new Set<string>()

    for (const incoming of payload.galleries) {
      const gid = String(incoming.gid ?? '').trim()
      if (!/^\d+$/.test(gid) || seen.has(gid)) continue
      seen.add(gid)
      const collectionIds = unique([
        ...(incoming.collectionIds ?? []),
        ...payloadCollections,
      ])
      const active = this.findActiveGallery(gid)
      if (active) {
        this.addSource(active.job, payload)
        active.gallery.collectionIds = unique([
          ...(active.gallery.collectionIds ?? []),
          ...collectionIds,
        ])
        if (
          active.job.pausedByScheduleId &&
          !this.isBlockedBySchedulePauses(active.job)
        ) {
          this.releaseSchedulePause(active.job)
          void this.startJob(active.job.jobId)
        }
        const managed = this.workspace?.getGallery(gid)
        if (managed && collectionIds.length) {
          this.workspace?.addGalleryToCollections(gid, collectionIds)
        }
        mergedJobs.add(active.job)
        continue
      }
      const downloadsPaused = this.isPayloadSchedulePaused(payload)
      pending.push({
        ...incoming,
        gid,
        targetPath: '',
        collectionIds,
        mode: downloadsPaused ? 'paused' : 'pending',
        progress: incoming.progress ?? 0,
        status: downloadsPaused
          ? 'Paused by schedule'
          : incoming.status || 'Waiting in queue...',
      })
    }

    let job = this.jobs.get(payload.jobId)
    if (job && ACTIVE_MODES.has(job.mode)) {
      this.addSource(job, payload)
      job.galleries.push(...pending)
      job.targetCollectionIds = unique([
        ...(job.targetCollectionIds ?? []),
        ...payloadCollections,
      ])
      if (pending.length) job.status = `Added ${pending.length} more galleries.`
      mergedJobs.add(job)
    } else if (pending.length) {
      const downloadsPaused = this.isPayloadSchedulePaused(payload)
      job = {
        jobId: payload.jobId,
        title: payload.title,
        progress: 0,
        status: downloadsPaused ? 'Paused by schedule' : 'Waiting in queue...',
        mode: downloadsPaused ? 'paused' : 'pending',
        galleries: pending,
        isExpanded: true,
        isArchive: payload.isArchive ?? false,
        password: payload.password ?? '',
        origin: payload.origin ?? 'manual',
        scheduleId: payload.scheduleId,
        scheduleRunId: payload.scheduleRunId,
        targetCollectionIds: payloadCollections,
        sourceScheduleIds: payload.scheduleId ? [payload.scheduleId] : [],
        hasManualSource: payload.origin !== 'schedule',
        pausedByScheduleId: downloadsPaused ? payload.scheduleId : undefined,
      }
      this.jobs.set(job.jobId, job)
    }

    for (const merged of mergedJobs) this.pushUpdate(merged)
    if (job && !mergedJobs.has(job)) this.pushUpdate(job)
    return job ?? mergedJobs.values().next().value ?? null
  }

  async startJob(jobId: string): Promise<void> {
    this.requireWorkspace()
    const job = this.jobs.get(jobId)
    if (!job || job.mode === 'running') return
    if (!['pending', 'paused', 'stopped'].includes(job.mode)) return
    if (this.isBlockedBySchedulePauses(job)) return
    if (this.runningCount >= MAX_CONCURRENT_JOBS) return
    await this.processJob(job)
  }

  pauseJob(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    this.controllers.get(jobId)?.abort()
    this.controllers.delete(jobId)
    job.mode = 'paused'
    job.status = 'Paused'
    for (const gallery of job.galleries) {
      if (gallery.mode !== 'running') continue
      gallery.mode = 'paused'
      gallery.status = 'Paused'
      this.updateManagedStatus(gallery.gid, 'paused', gallery.progress)
    }
    this.pushUpdate(job)
  }

  pauseScheduleDownloads(scheduleId: string): void {
    for (const job of this.jobs.values()) {
      if (!this.getSourceScheduleIds(job).includes(scheduleId)) continue
      if (!this.isBlockedBySchedulePauses(job)) continue
      if (!['pending', 'running'].includes(job.mode)) continue
      job.pausedByScheduleId = scheduleId
      this.pauseJob(job.jobId)
    }
  }

  resumeScheduleDownloads(scheduleId: string): void {
    const resumable: JobState[] = []
    for (const job of this.jobs.values()) {
      const belongsToSchedule = this.getSourceScheduleIds(job).includes(scheduleId)
      if (!belongsToSchedule) continue
      if (job.pausedByScheduleId && !this.isBlockedBySchedulePauses(job)) {
        this.releaseSchedulePause(job)
      }
      if (job.mode === 'pending') resumable.push(job)
    }
    for (const job of resumable) void this.startJob(job.jobId)
  }

  stopJob(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    this.controllers.get(jobId)?.abort()
    this.controllers.delete(jobId)
    job.mode = 'stopped'
    job.status = 'Stopped by user'
    for (const gallery of job.galleries) {
      if (gallery.mode === 'completed') continue
      gallery.mode = 'stopped'
      gallery.status = 'Stopped'
      this.updateManagedStatus(gallery.gid, 'stopped', gallery.progress)
    }
    this.pushUpdate(job)
  }

  stopAll(): void {
    for (const job of this.jobs.values()) {
      if (!ACTIVE_MODES.has(job.mode)) continue
      this.stopJob(job.jobId)
    }
  }

  restartJob(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    if (job.mode === 'running') this.controllers.get(jobId)?.abort()
    job.progress = 0
    job.mode = 'pending'
    job.status = 'Restarting...'
    for (const gallery of job.galleries) {
      gallery.progress = 0
      gallery.mode = 'pending'
      gallery.status = 'Pending...'
    }
    this.pushUpdate(job)
    void this.startJob(jobId)
  }

  removeJob(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job || job.mode === 'running') return
    this.jobs.delete(jobId)
    this.persist()
  }

  clearFinishedJobs(): void {
    for (const [jobId, job] of this.jobs.entries()) {
      if (['completed', 'error', 'stopped'].includes(job.mode)) this.jobs.delete(jobId)
    }
    this.persist()
  }

  private findActiveGallery(
    gid: string,
  ): { job: JobState; gallery: DownloadGallery } | null {
    for (const job of this.jobs.values()) {
      if (!ACTIVE_MODES.has(job.mode)) continue
      const gallery = job.galleries.find((candidate) => candidate.gid === gid)
      if (gallery) return { job, gallery }
    }
    return null
  }

  private getSourceScheduleIds(job: JobState): string[] {
    return unique([...(job.sourceScheduleIds ?? []), job.scheduleId])
  }

  private addSource(job: JobState, payload: AddToQueuePayload): void {
    job.sourceScheduleIds = unique([
      ...this.getSourceScheduleIds(job),
      payload.scheduleId,
    ])
    if (payload.origin !== 'schedule') job.hasManualSource = true
  }

  private isBlockedBySchedulePauses(job: JobState): boolean {
    if (job.hasManualSource) return false
    const scheduleIds = this.getSourceScheduleIds(job)
    return (
      scheduleIds.length > 0 &&
      scheduleIds.every(
        (scheduleId) => this.workspace?.getSchedule(scheduleId)?.downloadsPaused ?? false,
      )
    )
  }

  private isPayloadSchedulePaused(payload: AddToQueuePayload): boolean {
    if (payload.origin !== 'schedule' || !payload.scheduleId) return false
    return this.workspace?.getSchedule(payload.scheduleId)?.downloadsPaused ?? false
  }

  private releaseSchedulePause(job: JobState): void {
    job.pausedByScheduleId = undefined
    job.mode = 'pending'
    job.status = 'Waiting in queue...'
    for (const gallery of job.galleries) {
      if (gallery.mode !== 'paused') continue
      gallery.mode = 'pending'
      gallery.status = 'Pending...'
    }
    this.pushUpdate(job)
  }

  private async processJob(job: JobState): Promise<void> {
    const workspace = this.requireWorkspace()
    this.runningCount++
    job.mode = 'running'
    const controller = new AbortController()
    this.controllers.set(job.jobId, controller)
    let completedCount = job.galleries.filter(
      (gallery) => gallery.mode === 'completed',
    ).length

    try {
      for (const gallery of job.galleries) {
        if (controller.signal.aborted) break
        if (gallery.mode === 'completed') continue

        const targetPath = workspace.resolveGalleryPath(gallery.gid)
        gallery.targetPath = targetPath
        gallery.mode = 'running'
        gallery.status = 'Downloading...'
        const startedAt = new Date().toISOString()
        workspace.upsertGallery({
          gid: gallery.gid,
          token: gallery.token,
          title: gallery.title,
          link: gallery.link,
          imagecount: gallery.imagecount,
          status: 'downloading',
          progress: gallery.progress,
          startedAt,
        })
        const collectionIds = unique(gallery.collectionIds ?? [])
        if (collectionIds.length)
          workspace.addGalleryToCollections(gallery.gid, collectionIds)
        this.pushUpdate(job)

        const result = await this.downloadService.downloadGallery({
          gallery,
          targetPath,
          isArchive: job.isArchive ?? false,
          password: job.password ?? '',
          signal: controller.signal,
          onProgress: (data) => {
            if (data.progress !== undefined) gallery.progress = data.progress
            if (data.status) gallery.status = data.status
            job.progress = this.calculateProgress(job)
            this.updateManagedStatus(gallery.gid, 'downloading', gallery.progress)
            this.pushUpdate(job)
          },
        })

        if (result.error === 'aborted') break
        if (result.success) {
          gallery.mode = 'completed'
          gallery.progress = 100
          gallery.status = 'Completed'
          completedCount++
          workspace.updateGalleryStatus(gallery.gid, 'completed', {
            progress: 100,
            completedAt: new Date().toISOString(),
          })
        } else {
          gallery.mode = 'error'
          gallery.status = result.error ?? 'Failed'
          workspace.updateGalleryStatus(gallery.gid, 'error', {
            progress: gallery.progress,
            error: result.error ?? 'Download failed',
          })
        }

        job.progress = this.calculateProgress(job)
        job.status = `Progress: ${completedCount}/${job.galleries.length} galleries.`
        this.pushUpdate(job)
      }
    } finally {
      this.runningCount--
      this.controllers.delete(job.jobId)

      if (job.mode === 'running') {
        if (completedCount === job.galleries.length) {
          job.mode = 'completed'
          job.progress = 100
          job.status = job.isArchive ? 'Finished & Archived' : 'Finished'
        } else {
          job.mode = 'error'
          job.status = `Error: ${completedCount}/${job.galleries.length} galleries completed`
        }
        this.pushUpdate(job)
      }

      this.tryStartNext()
    }
  }

  private calculateProgress(job: JobState): number {
    if (!job.galleries.length) return 0
    const total = job.galleries.reduce((sum, gallery) => sum + gallery.progress, 0)
    return Math.round(total / job.galleries.length)
  }

  private updateManagedStatus(
    gid: string,
    status: ManagedGalleryStatus,
    progress: number,
  ): void {
    if (!this.workspace?.getGallery(gid)) return
    this.workspace.updateGalleryStatus(gid, status, { progress })
  }

  private tryStartNext(): void {
    for (const job of this.jobs.values()) {
      if (this.runningCount >= MAX_CONCURRENT_JOBS) return
      if (job.mode === 'pending') void this.startJob(job.jobId)
    }
  }
}
