import type { BrowserWindow } from 'electron'
import type {
  AddToQueueItemPayload,
  DownloadQueueItem,
  ManagedGalleryStatus,
} from '@shared/types/api'
import { DownloadService } from './download_service'
import type { WorkspaceRepository } from './workspace_repository'

const MAX_CONCURRENT_ITEMS = 3
const ACTIVE_MODES = new Set<DownloadQueueItem['mode']>(['pending', 'running', 'paused'])

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

/** Coordinates the flat download queue. Every queue item owns exactly one Gallery. */
export class JobManager {
  private queueItems = new Map<string, DownloadQueueItem>()
  private controllers = new Map<string, AbortController>()
  private activeRuns = new Map<string, Promise<void>>()
  private runningCount = 0
  private downloadService: DownloadService
  private workspace: WorkspaceRepository | null = null

  constructor(
    private mainWindow: BrowserWindow | null,
    workspace?: WorkspaceRepository,
    downloadService = new DownloadService(),
  ) {
    this.downloadService = downloadService
    if (workspace) this.setWorkspace(workspace)
  }

  setWorkspace(workspace: WorkspaceRepository | null): void {
    this.workspace = workspace
    this.queueItems.clear()
    if (!workspace) return
    for (const saved of workspace.loadQueueItems()) {
      const item: DownloadQueueItem = {
        ...saved,
        mode: saved.mode === 'running' ? 'paused' : saved.mode,
        status: saved.mode === 'running' ? 'Paused' : saved.status,
        sourceScheduleIds: unique([...(saved.sourceScheduleIds ?? []), saved.scheduleId]),
        hasManualSource: saved.hasManualSource ?? saved.origin !== 'schedule',
      }
      this.queueItems.set(item.queueItemId, item)
    }
    this.persist()
  }

  private requireWorkspace(): WorkspaceRepository {
    if (!this.workspace) throw new Error('請先設定工作資料夾')
    return this.workspace
  }

  private persist(): void {
    if (this.workspace) {
      this.workspace.saveQueueItems(Array.from(this.queueItems.values()))
    }
  }

  private pushUpdate(item: DownloadQueueItem): void {
    this.persist()
    this.mainWindow?.webContents.send('download-queue-item-updated', { item })
  }

  getQueueItems(): DownloadQueueItem[] {
    return Array.from(this.queueItems.values())
  }

  addQueueItem(payload: AddToQueueItemPayload): DownloadQueueItem | null {
    this.requireWorkspace()
    const gid = String(payload.gallery.gid ?? '').trim()
    if (!/^\d+$/.test(gid)) return null

    const collectionIds = unique([
      ...(payload.gallery.collectionIds ?? []),
      ...(payload.targetCollectionIds ?? []),
    ])
    const active = this.findActiveItem(gid)
    if (active) {
      this.addSource(active, payload)
      active.collectionIds = unique([...(active.collectionIds ?? []), ...collectionIds])
      active.targetCollectionIds = unique([
        ...(active.targetCollectionIds ?? []),
        ...(payload.targetCollectionIds ?? []),
      ])
      if (active.pausedByScheduleId && !this.isBlockedBySchedulePauses(active)) {
        this.releaseSchedulePause(active)
        void this.startQueueItem(active.queueItemId)
      }
      const managed = this.workspace?.getGallery(gid)
      if (managed && collectionIds.length) {
        this.workspace?.addGalleryToCollections(gid, collectionIds)
      }
      this.pushUpdate(active)
      return active
    }

    const downloadsPaused = this.isPayloadSchedulePaused(payload)
    const item: DownloadQueueItem = {
      ...payload.gallery,
      gid,
      queueItemId: payload.queueItemId,
      targetPath: '',
      collectionIds,
      mode: downloadsPaused ? 'paused' : 'pending',
      progress: payload.gallery.progress ?? 0,
      status: downloadsPaused
        ? 'Paused by schedule'
        : payload.gallery.status || 'Waiting in queue...',
      isArchive: payload.isArchive ?? payload.gallery.isArchive ?? false,
      password: payload.password ?? payload.gallery.password ?? '',
      origin: payload.origin ?? 'manual',
      scheduleId: payload.scheduleId,
      scheduleRunId: payload.scheduleRunId,
      targetCollectionIds: unique(payload.targetCollectionIds ?? []),
      sourceScheduleIds: payload.scheduleId ? [payload.scheduleId] : [],
      hasManualSource: payload.origin !== 'schedule',
      pausedByScheduleId: downloadsPaused ? payload.scheduleId : undefined,
    }
    this.queueItems.set(item.queueItemId, item)
    this.pushUpdate(item)
    return item
  }

  async startQueueItem(queueItemId: string): Promise<void> {
    this.requireWorkspace()
    const activeRun = this.activeRuns.get(queueItemId)
    if (activeRun) {
      await activeRun
      return this.startQueueItem(queueItemId)
    }
    const item = this.queueItems.get(queueItemId)
    if (!item || item.mode === 'running') return
    if (!['pending', 'paused'].includes(item.mode)) return
    if (this.isBlockedBySchedulePauses(item)) return
    if (this.runningCount >= MAX_CONCURRENT_ITEMS) return
    const run = this.processQueueItem(item)
    this.activeRuns.set(queueItemId, run)
    try {
      await run
    } finally {
      if (this.activeRuns.get(queueItemId) === run) {
        this.activeRuns.delete(queueItemId)
      }
    }
  }

  pauseQueueItem(queueItemId: string): void {
    const item = this.queueItems.get(queueItemId)
    if (!item || !['pending', 'running'].includes(item.mode)) return
    this.controllers.get(queueItemId)?.abort()
    this.controllers.delete(queueItemId)
    item.mode = 'paused'
    item.status = 'Paused'
    this.updateManagedStatus(item.gid, 'paused', item.progress)
    this.pushUpdate(item)
  }

  pauseScheduleDownloads(scheduleId: string): void {
    for (const item of this.queueItems.values()) {
      if (!this.getSourceScheduleIds(item).includes(scheduleId)) continue
      if (!this.isBlockedBySchedulePauses(item)) continue
      if (!['pending', 'running'].includes(item.mode)) continue
      item.pausedByScheduleId = scheduleId
      this.pauseQueueItem(item.queueItemId)
    }
  }

  resumeScheduleDownloads(scheduleId: string): void {
    const resumable: DownloadQueueItem[] = []
    for (const item of this.queueItems.values()) {
      if (!this.getSourceScheduleIds(item).includes(scheduleId)) continue
      if (item.pausedByScheduleId && !this.isBlockedBySchedulePauses(item)) {
        this.releaseSchedulePause(item)
      }
      if (item.mode === 'pending') resumable.push(item)
    }
    for (const item of resumable) void this.startQueueItem(item.queueItemId)
  }

  stopQueueItem(queueItemId: string): void {
    const item = this.queueItems.get(queueItemId)
    if (!item || !ACTIVE_MODES.has(item.mode)) return
    this.controllers.get(queueItemId)?.abort()
    this.controllers.delete(queueItemId)
    item.mode = 'stopped'
    item.status = 'Stopped by user'
    this.updateManagedStatus(item.gid, 'stopped', item.progress)
    this.pushUpdate(item)
  }

  stopAll(): void {
    for (const item of this.queueItems.values()) {
      if (ACTIVE_MODES.has(item.mode)) this.stopQueueItem(item.queueItemId)
    }
  }

  async restartQueueItem(queueItemId: string): Promise<void> {
    const item = this.queueItems.get(queueItemId)
    if (!item) return
    const activeRun = this.activeRuns.get(queueItemId)
    if (item.mode === 'running') this.controllers.get(queueItemId)?.abort()
    item.progress = 0
    item.mode = 'pending'
    item.status = 'Restarting...'
    this.pushUpdate(item)
    if (activeRun) await activeRun
    await this.startQueueItem(queueItemId)
  }

  removeQueueItem(queueItemId: string): void {
    const item = this.queueItems.get(queueItemId)
    if (!item || item.mode === 'running') return
    this.queueItems.delete(queueItemId)
    this.persist()
  }

  clearFinishedQueueItems(): void {
    for (const [queueItemId, item] of this.queueItems.entries()) {
      if (['completed', 'error', 'stopped'].includes(item.mode)) {
        this.queueItems.delete(queueItemId)
      }
    }
    this.persist()
  }

  private findActiveItem(gid: string): DownloadQueueItem | null {
    for (const item of this.queueItems.values()) {
      if (ACTIVE_MODES.has(item.mode) && item.gid === gid) return item
    }
    return null
  }

  private getSourceScheduleIds(item: DownloadQueueItem): string[] {
    return unique([...(item.sourceScheduleIds ?? []), item.scheduleId])
  }

  private addSource(item: DownloadQueueItem, payload: AddToQueueItemPayload): void {
    item.sourceScheduleIds = unique([
      ...this.getSourceScheduleIds(item),
      payload.scheduleId,
    ])
    if (payload.origin !== 'schedule') item.hasManualSource = true
  }

  private isBlockedBySchedulePauses(item: DownloadQueueItem): boolean {
    if (item.hasManualSource) return false
    const scheduleIds = this.getSourceScheduleIds(item)
    return (
      scheduleIds.length > 0 &&
      scheduleIds.every(
        (scheduleId) => this.workspace?.getSchedule(scheduleId)?.downloadsPaused ?? false,
      )
    )
  }

  private isPayloadSchedulePaused(payload: AddToQueueItemPayload): boolean {
    if (payload.origin !== 'schedule' || !payload.scheduleId) return false
    return this.workspace?.getSchedule(payload.scheduleId)?.downloadsPaused ?? false
  }

  private releaseSchedulePause(item: DownloadQueueItem): void {
    item.pausedByScheduleId = undefined
    item.mode = 'pending'
    item.status = 'Waiting in queue...'
    this.pushUpdate(item)
  }

  private async processQueueItem(item: DownloadQueueItem): Promise<void> {
    const workspace = this.requireWorkspace()
    this.runningCount++
    item.mode = 'running'
    item.status = 'Downloading...'
    const controller = new AbortController()
    this.controllers.set(item.queueItemId, controller)

    try {
      item.targetPath = workspace.resolveGalleryPath(item.gid)
      workspace.upsertGallery({
        gid: item.gid,
        token: item.token,
        title: item.title,
        link: item.link,
        imagecount: item.imagecount,
        status: 'downloading',
        progress: item.progress,
        startedAt: new Date().toISOString(),
      })
      const collectionIds = unique(item.collectionIds ?? [])
      if (collectionIds.length) {
        workspace.addGalleryToCollections(item.gid, collectionIds)
      }
      this.pushUpdate(item)

      const result = await this.downloadService.downloadGallery({
        gallery: item,
        targetPath: item.targetPath,
        isArchive: item.isArchive,
        password: item.password ?? '',
        signal: controller.signal,
        onProgress: (data) => {
          if (data.progress !== undefined) item.progress = data.progress
          if (data.status) item.status = data.status
          this.updateManagedStatus(item.gid, 'downloading', item.progress)
          this.pushUpdate(item)
        },
      })

      if (result.error === 'aborted') return
      if (result.success) {
        item.mode = 'completed'
        item.progress = 100
        item.status = item.isArchive ? 'Finished & Archived' : 'Finished'
        workspace.updateGalleryStatus(item.gid, 'completed', {
          progress: 100,
          completedAt: new Date().toISOString(),
        })
      } else {
        item.mode = 'error'
        item.status = result.error ?? 'Failed'
        workspace.updateGalleryStatus(item.gid, 'error', {
          progress: item.progress,
          error: result.error ?? 'Download failed',
        })
      }
      this.pushUpdate(item)
    } catch (reason) {
      if (item.mode !== 'running') return
      const message = reason instanceof Error ? reason.message : String(reason)
      item.mode = 'error'
      item.status = message || 'Download failed'
      if (workspace.getGallery(item.gid)) {
        workspace.updateGalleryStatus(item.gid, 'error', {
          progress: item.progress,
          error: item.status,
        })
      }
      this.pushUpdate(item)
    } finally {
      this.runningCount--
      if (this.controllers.get(item.queueItemId) === controller) {
        this.controllers.delete(item.queueItemId)
      }
      this.tryStartNext()
    }
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
    for (const item of this.queueItems.values()) {
      if (this.runningCount >= MAX_CONCURRENT_ITEMS) return
      if (item.mode === 'pending' && !this.activeRuns.has(item.queueItemId)) {
        void this.startQueueItem(item.queueItemId)
      }
    }
  }
}
