import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import type {
  Collection,
  CreateCollectionPayload,
  CreateSchedulePayload,
  DownloadGallery,
  DownloadQueueItem,
  ManagedGallery,
  ManagedGalleryStatus,
  Schedule,
  ScheduleRun,
  ScheduleRunStatus,
  UpdateCollectionPayload,
  UpdateGalleryStatusPatch,
  UpdateSchedulePayload,
  UpsertGalleryPayload,
  WorkspaceManifest,
  WorkspaceSettings,
  WorkspaceState,
} from '../../shared/types/api'
import type { LogEntry } from '../../shared/types/log'
import {
  DEFAULT_WORKSPACE_SETTINGS,
  WORKSPACE_DATA_DIR,
  WORKSPACE_GALLERIES_DIR,
} from '../../shared/utilities'

interface GalleryIndexFile {
  galleries: Record<string, ManagedGallery>
}

interface WorkspacePaths {
  data: string
  galleries: string
  manifest: string
  settings: string
  index: string
  collections: string
  schedules: string
  scheduleRuns: string
  jobs: string
  logs: string
}

type CollectionPatch = Pick<UpdateCollectionPayload, 'name' | 'coverGid'>
type SchedulePatch = Omit<UpdateSchedulePayload, 'scheduleId'>

interface LegacyJobState {
  jobId: string
  title: string
  progress: number
  status: string
  mode: DownloadQueueItem['mode']
  galleries: DownloadGallery[]
  isArchive?: boolean
  password?: string
  origin?: 'manual' | 'schedule'
  scheduleId?: string
  scheduleRunId?: string
  targetCollectionIds?: string[]
  sourceScheduleIds?: string[]
  hasManualSource?: boolean
  pausedByScheduleId?: string
}

const MAX_SCHEDULE_RUNS = 500
const MAX_LOG_BYTES = 5 * 1024 * 1024

function normalizeGid(gid: string | number): string {
  const normalized = String(gid).trim()
  if (!/^\d+$/.test(normalized)) throw new Error('Gallery GID 必須是數字')
  return normalized
}

function normalizePageLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 3
  return Math.max(1, Math.floor(value))
}

function normalizeProgress(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function parseMonitorUrl(value: string): { canonicalUrl: string; query: string } {
  const input = value.trim()
  if (!input) throw new Error('監看網址不可空白')

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error('監看網址格式無效')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('監看網址只支援 HTTP 或 HTTPS')
  }

  parsed.hash = ''
  parsed.hostname = parsed.hostname.toLowerCase()
  const searchQuery = parsed.searchParams.get('f_search')?.trim()
  const pathLabel = parsed.pathname.split('/').filter(Boolean).at(-1)
  return {
    canonicalUrl: parsed.toString(),
    query: searchQuery || pathLabel || parsed.hostname,
  }
}

/**
 * Owns all portable domain state below one workspace directory.
 *
 * Search results are deliberately not persisted here. Call upsertGallery only
 * when a real download starts, which is the point at which a result becomes a
 * managed Gallery.
 */
export class WorkspaceRepository {
  private rootPath: string | null = null

  constructor(private readonly appVersion = '0.0.0') {}

  get root(): string | null {
    return this.rootPath
  }

  activate(rootPath: string): WorkspaceState {
    const resolved = path.resolve(rootPath)
    fs.mkdirSync(resolved, { recursive: true })
    if (!fs.statSync(resolved).isDirectory()) throw new Error('工作資料夾路徑不是資料夾')

    const previousRoot = this.rootPath
    this.rootPath = resolved
    try {
      this.initializeFiles()
      return this.getState()
    } catch (error) {
      this.rootPath = previousRoot
      throw error
    }
  }

  deactivate(): void {
    this.rootPath = null
  }

  getState(): WorkspaceState {
    if (!this.rootPath) return { configured: false, path: null }
    return {
      configured: true,
      path: this.rootPath,
      manifest: this.readJson<WorkspaceManifest>(this.paths().manifest),
    }
  }

  getSettings(): WorkspaceSettings {
    const stored = this.readJson<Partial<WorkspaceSettings>>(this.paths().settings, {})
    return this.normalizeSettings({ ...DEFAULT_WORKSPACE_SETTINGS, ...stored })
  }

  saveSettings(settings: Partial<WorkspaceSettings>): WorkspaceSettings {
    const normalized = this.normalizeSettings({ ...this.getSettings(), ...settings })
    this.writeJson(this.paths().settings, normalized)
    this.touchManifest()
    return normalized
  }

  resolveGalleryPath(gid: string | number): string {
    return path.join(this.paths().galleries, normalizeGid(gid))
  }

  listGalleries(): ManagedGallery[] {
    return Object.values(this.readIndex().galleries).sort((left, right) => {
      const updatedOrder = right.updatedAt.localeCompare(left.updatedAt)
      return (
        updatedOrder || right.gid.localeCompare(left.gid, undefined, { numeric: true })
      )
    })
  }

  getGallery(gid: string | number): ManagedGallery | undefined {
    return this.readIndex().galleries[normalizeGid(gid)]
  }

  upsertGallery(input: UpsertGalleryPayload): ManagedGallery {
    const gid = normalizeGid(input.gid)
    const index = this.readIndex()
    const existing = index.galleries[gid]
    const now = new Date().toISOString()
    const status = input.status ?? existing?.status ?? 'downloading'
    const localPath = this.resolveGalleryPath(gid)
    fs.mkdirSync(localPath, { recursive: true })

    const gallery: ManagedGallery = {
      ...existing,
      gid,
      token: input.token ?? existing?.token ?? '',
      title: input.title.trim() || existing?.title || `GID ${gid}`,
      link: input.link.trim() || existing?.link || '',
      localPath,
      status,
      progress: normalizeProgress(input.progress ?? existing?.progress),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(input.imagecount !== undefined ? { imagecount: input.imagecount } : {}),
      ...(input.thumb !== undefined ? { thumb: input.thumb } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.posted !== undefined ? { posted: input.posted } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
    }

    if (!gallery.startedAt && status === 'downloading') gallery.startedAt = now
    if (!gallery.completedAt && status === 'completed') gallery.completedAt = now
    if (status === 'completed') gallery.progress = 100
    if (status !== 'error' && input.error === undefined) delete gallery.error

    index.galleries[gid] = gallery
    this.writeIndex(index)
    this.touchManifest()
    return gallery
  }

  /** Compatibility alias for download orchestration code. */
  recordGallery(input: UpsertGalleryPayload): ManagedGallery {
    return this.upsertGallery(input)
  }

  updateGalleryStatus(
    gid: string | number,
    status: ManagedGalleryStatus,
    patch: UpdateGalleryStatusPatch = {},
  ): ManagedGallery {
    const normalizedGid = normalizeGid(gid)
    const index = this.readIndex()
    const gallery = index.galleries[normalizedGid]
    if (!gallery) throw new Error(`找不到 GID ${normalizedGid}`)

    const now = new Date().toISOString()
    gallery.status = status
    gallery.updatedAt = now
    if (patch.progress !== undefined) gallery.progress = normalizeProgress(patch.progress)
    if (patch.error !== undefined) gallery.error = patch.error
    if (patch.startedAt !== undefined) gallery.startedAt = patch.startedAt
    if (patch.completedAt !== undefined) gallery.completedAt = patch.completedAt
    if (!gallery.startedAt && status === 'downloading') gallery.startedAt = now
    if (status === 'completed') {
      gallery.progress = 100
      gallery.completedAt ??= now
    }
    if (status !== 'error' && patch.error === undefined) delete gallery.error

    this.writeIndex(index)
    this.touchManifest()
    return gallery
  }

  removeGallery(gid: string | number): boolean {
    const normalizedGid = normalizeGid(gid)
    const index = this.readIndex()
    if (!index.galleries[normalizedGid]) return false
    delete index.galleries[normalizedGid]
    this.writeIndex(index)

    const collections = this.listCollections()
    let collectionsChanged = false
    for (const collection of collections) {
      const previousLength = collection.books.length
      collection.books = collection.books.filter((book) => book.gid !== normalizedGid)
      if (collection.books.length === previousLength) continue
      if (collection.coverGid === normalizedGid) delete collection.coverGid
      collection.updatedAt = new Date().toISOString()
      collectionsChanged = true
    }
    if (collectionsChanged) this.writeJson(this.paths().collections, collections)
    this.touchManifest()
    return true
  }

  deleteGallery(gid: string | number): boolean {
    return this.removeGallery(gid)
  }

  listCollections(): Collection[] {
    return this.readJson<Collection[]>(this.paths().collections, []).sort(
      (left, right) => left.position - right.position,
    )
  }

  createCollection(input: string | CreateCollectionPayload): Collection {
    const name = (typeof input === 'string' ? input : input.name).trim()
    if (!name) throw new Error('Collection 名稱不可空白')
    const collections = this.listCollections()
    if (
      collections.some(
        (collection) => collection.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new Error('Collection 名稱已存在')
    }

    const now = new Date().toISOString()
    const collection: Collection = {
      collectionId: randomUUID(),
      name,
      position: collections.length,
      books: [],
      createdAt: now,
      updatedAt: now,
    }
    collections.push(collection)
    this.writeJson(this.paths().collections, collections)
    this.touchManifest()
    return collection
  }

  updateCollection(payload: UpdateCollectionPayload): Collection
  updateCollection(collectionId: string, patch: CollectionPatch): Collection
  updateCollection(
    collectionIdOrPayload: string | UpdateCollectionPayload,
    maybePatch?: CollectionPatch,
  ): Collection {
    const collectionId =
      typeof collectionIdOrPayload === 'string'
        ? collectionIdOrPayload
        : collectionIdOrPayload.collectionId
    const patch =
      typeof collectionIdOrPayload === 'string'
        ? (maybePatch ?? {})
        : collectionIdOrPayload
    const collections = this.listCollections()
    const collection = collections.find(
      (candidate) => candidate.collectionId === collectionId,
    )
    if (!collection) throw new Error('找不到 Collection')

    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new Error('Collection 名稱不可空白')
      if (
        collections.some(
          (candidate) =>
            candidate.collectionId !== collectionId &&
            candidate.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new Error('Collection 名稱已存在')
      }
      collection.name = name
    }
    if (patch.coverGid !== undefined) {
      if (patch.coverGid === null) delete collection.coverGid
      else {
        const coverGid = normalizeGid(patch.coverGid)
        if (!collection.books.some((book) => book.gid === coverGid)) {
          throw new Error('封面必須選自此 Collection')
        }
        collection.coverGid = coverGid
      }
    }
    collection.updatedAt = new Date().toISOString()
    this.writeJson(this.paths().collections, collections)
    this.touchManifest()
    return collection
  }

  deleteCollection(collectionId: string): boolean {
    const collections = this.listCollections()
    if (!collections.some((collection) => collection.collectionId === collectionId))
      return false

    this.writeJson(
      this.paths().collections,
      collections
        .filter((collection) => collection.collectionId !== collectionId)
        .map((collection, position) => ({ ...collection, position })),
    )

    const now = new Date().toISOString()
    const schedules = this.listSchedules().map((schedule) =>
      schedule.targetCollectionId === collectionId
        ? { ...schedule, targetCollectionId: null, updatedAt: now }
        : schedule,
    )
    this.writeJson(this.paths().schedules, schedules)
    this.touchManifest()
    return true
  }

  addBookToCollections(
    gid: string | number,
    collectionIds: string[],
  ): { added: number; existing: number } {
    const normalizedGid = normalizeGid(gid)
    if (!this.getGallery(normalizedGid))
      throw new Error(`GID ${normalizedGid} 尚未建立 Gallery`)
    const targetIds = [...new Set(collectionIds)]
    if (targetIds.length === 0) return { added: 0, existing: 0 }

    const collections = this.listCollections()
    const knownIds = new Set(collections.map((collection) => collection.collectionId))
    if (targetIds.some((collectionId) => !knownIds.has(collectionId))) {
      throw new Error('找不到指定的 Collection')
    }

    const now = new Date().toISOString()
    let added = 0
    let existing = 0
    for (const collection of collections) {
      if (!targetIds.includes(collection.collectionId)) continue
      if (collection.books.some((book) => book.gid === normalizedGid)) existing++
      else {
        collection.books.push({ gid: normalizedGid, addedAt: now })
        collection.updatedAt = now
        added++
      }
    }
    this.writeJson(this.paths().collections, collections)
    this.touchManifest()
    return { added, existing }
  }

  /** Compatibility alias used by the download and scheduling services. */
  addGalleryToCollections(
    gid: string | number,
    collectionIds: string[],
  ): { added: number; existing: number } {
    return this.addBookToCollections(gid, collectionIds)
  }

  removeBookFromCollection(gid: string | number, collectionId: string): boolean {
    const normalizedGid = normalizeGid(gid)
    const collections = this.listCollections()
    const collection = collections.find(
      (candidate) => candidate.collectionId === collectionId,
    )
    if (!collection) throw new Error('找不到 Collection')
    const previousLength = collection.books.length
    collection.books = collection.books.filter((book) => book.gid !== normalizedGid)
    if (collection.books.length === previousLength) return false
    if (collection.coverGid === normalizedGid) delete collection.coverGid
    collection.updatedAt = new Date().toISOString()
    this.writeJson(this.paths().collections, collections)
    this.touchManifest()
    return true
  }

  listUncategorizedGalleries(): ManagedGallery[] {
    const categorizedGids = new Set(
      this.listCollections().flatMap((collection) =>
        collection.books.map((book) => book.gid),
      ),
    )
    return this.listGalleries().filter((gallery) => !categorizedGids.has(gallery.gid))
  }

  isGalleryUncategorized(gid: string | number): boolean {
    const normalizedGid = normalizeGid(gid)
    return !this.listCollections().some((collection) =>
      collection.books.some((book) => book.gid === normalizedGid),
    )
  }

  listSchedules(): Schedule[] {
    return this.readJson<Schedule[]>(this.paths().schedules, [])
      .map((schedule) => ({
        ...schedule,
        downloadsPaused: schedule.downloadsPaused ?? false,
      }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  getSchedule(scheduleId: string): Schedule | undefined {
    return this.listSchedules().find((schedule) => schedule.scheduleId === scheduleId)
  }

  createSchedule(input: CreateSchedulePayload): Schedule {
    const parsed = parseMonitorUrl(input.monitorUrl)
    const targetCollectionId = input.targetCollectionId ?? null
    this.assertCollectionExists(targetCollectionId)
    const cronExpression = input.cronExpression.trim()
    if (!cronExpression) throw new Error('排程頻率不可空白')

    const now = new Date().toISOString()
    const schedule: Schedule = {
      scheduleId: randomUUID(),
      name: input.name.trim() || parsed.query,
      monitorUrl: input.monitorUrl.trim(),
      canonicalUrl: parsed.canonicalUrl,
      query: parsed.query,
      cronExpression,
      pageLimit: normalizePageLimit(input.pageLimit),
      targetCollectionId,
      enabled: input.enabled ?? true,
      downloadsPaused: false,
      createdAt: now,
      updatedAt: now,
    }
    const schedules = this.listSchedules()
    schedules.push(schedule)
    this.writeJson(this.paths().schedules, schedules)
    this.touchManifest()
    return schedule
  }

  setScheduleDownloadsPaused(scheduleId: string, paused: boolean): Schedule {
    const schedules = this.listSchedules()
    const schedule = schedules.find((candidate) => candidate.scheduleId === scheduleId)
    if (!schedule) throw new Error('找不到排程')
    schedule.downloadsPaused = paused
    schedule.updatedAt = new Date().toISOString()
    this.writeJson(this.paths().schedules, schedules)
    this.touchManifest()
    return schedule
  }

  updateSchedule(payload: UpdateSchedulePayload): Schedule
  updateSchedule(scheduleId: string, patch: SchedulePatch): Schedule
  updateSchedule(
    scheduleIdOrPayload: string | UpdateSchedulePayload,
    maybePatch?: SchedulePatch,
  ): Schedule {
    const scheduleId =
      typeof scheduleIdOrPayload === 'string'
        ? scheduleIdOrPayload
        : scheduleIdOrPayload.scheduleId
    const patch =
      typeof scheduleIdOrPayload === 'string' ? (maybePatch ?? {}) : scheduleIdOrPayload
    const schedules = this.listSchedules()
    const schedule = schedules.find((candidate) => candidate.scheduleId === scheduleId)
    if (!schedule) throw new Error('找不到排程')

    if (patch.monitorUrl !== undefined) {
      const parsed = parseMonitorUrl(patch.monitorUrl)
      schedule.monitorUrl = patch.monitorUrl.trim()
      schedule.canonicalUrl = parsed.canonicalUrl
      schedule.query = parsed.query
    }
    if (patch.name !== undefined) schedule.name = patch.name.trim() || schedule.query
    if (patch.cronExpression !== undefined) {
      const cronExpression = patch.cronExpression.trim()
      if (!cronExpression) throw new Error('排程頻率不可空白')
      schedule.cronExpression = cronExpression
    }
    if (patch.pageLimit !== undefined)
      schedule.pageLimit = normalizePageLimit(patch.pageLimit)
    if (patch.targetCollectionId !== undefined) {
      this.assertCollectionExists(patch.targetCollectionId)
      schedule.targetCollectionId = patch.targetCollectionId
    }
    if (patch.enabled !== undefined) schedule.enabled = patch.enabled
    schedule.updatedAt = new Date().toISOString()
    this.writeJson(this.paths().schedules, schedules)
    this.touchManifest()
    return schedule
  }

  deleteSchedule(scheduleId: string): boolean {
    const schedules = this.listSchedules()
    if (!schedules.some((schedule) => schedule.scheduleId === scheduleId)) return false
    this.writeJson(
      this.paths().schedules,
      schedules.filter((schedule) => schedule.scheduleId !== scheduleId),
    )
    this.writeJson(
      this.paths().scheduleRuns,
      this.listScheduleRuns().filter((run) => run.scheduleId !== scheduleId),
    )
    this.touchManifest()
    return true
  }

  saveScheduleRun(run: ScheduleRun): ScheduleRun {
    const runs = this.readJson<ScheduleRun[]>(this.paths().scheduleRuns, [])
    const index = runs.findIndex((candidate) => candidate.runId === run.runId)
    if (index >= 0) runs[index] = run
    else runs.push(run)
    this.writeJson(this.paths().scheduleRuns, runs.slice(-MAX_SCHEDULE_RUNS))
    this.touchManifest()
    return run
  }

  listScheduleRuns(scheduleId?: string): ScheduleRun[] {
    return this.readJson<ScheduleRun[]>(this.paths().scheduleRuns, [])
      .filter((run) => !scheduleId || run.scheduleId === scheduleId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  }

  markScheduleRun(
    scheduleId: string,
    status: Exclude<ScheduleRunStatus, 'running'>,
    message = '',
  ): Schedule | undefined {
    const schedules = this.listSchedules()
    const schedule = schedules.find((candidate) => candidate.scheduleId === scheduleId)
    if (!schedule) return undefined
    const now = new Date().toISOString()
    schedule.lastRunAt = now
    schedule.lastRunStatus = status
    schedule.lastRunMessage = message
    schedule.updatedAt = now
    this.writeJson(this.paths().schedules, schedules)
    this.touchManifest()
    return schedule
  }

  loadQueueItems(): DownloadQueueItem[] {
    const stored = this.readJson<Array<DownloadQueueItem | LegacyJobState>>(
      this.paths().jobs,
      [],
    )
    return stored.flatMap((entry) => {
      if ('queueItemId' in entry) return [entry]
      const multiple = entry.galleries.length > 1
      return entry.galleries.map((gallery) => {
        const inheritsJobState =
          gallery.mode !== 'completed' &&
          (entry.mode === 'running' ||
            entry.mode === 'paused' ||
            entry.mode === 'stopped')
        return {
          ...gallery,
          queueItemId: multiple ? `${entry.jobId}-${gallery.gid}` : entry.jobId,
          mode: inheritsJobState ? entry.mode : gallery.mode,
          status: inheritsJobState ? entry.status : gallery.status,
          isArchive: entry.isArchive ?? gallery.isArchive ?? false,
          password: entry.password ?? gallery.password ?? '',
          origin: entry.origin,
          scheduleId: entry.scheduleId,
          scheduleRunId: entry.scheduleRunId,
          targetCollectionIds: entry.targetCollectionIds,
          sourceScheduleIds: entry.sourceScheduleIds,
          hasManualSource: entry.hasManualSource,
          pausedByScheduleId: entry.pausedByScheduleId,
        }
      })
    })
  }

  getQueueItems(): DownloadQueueItem[] {
    return this.loadQueueItems()
  }

  saveQueueItems(items: DownloadQueueItem[]): void {
    this.writeJson(this.paths().jobs, items)
    this.touchManifest()
  }

  appendLog(entry: LogEntry): void {
    const logsPath = this.paths().logs
    if (fs.statSync(logsPath).size >= MAX_LOG_BYTES) {
      const rotatedPath = `${logsPath}.1`
      if (fs.existsSync(rotatedPath)) fs.rmSync(rotatedPath)
      fs.renameSync(logsPath, rotatedPath)
      fs.writeFileSync(logsPath, '', 'utf8')
    }
    fs.appendFileSync(logsPath, `${JSON.stringify(entry)}\n`, 'utf8')
  }

  readLogs(limit = 500): LogEntry[] {
    return fs
      .readFileSync(this.paths().logs, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-Math.max(0, limit))
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as LogEntry]
        } catch {
          return []
        }
      })
      .reverse()
  }

  clearLogs(): void {
    fs.writeFileSync(this.paths().logs, '', 'utf8')
  }

  private initializeFiles(): void {
    const paths = this.paths()
    fs.mkdirSync(paths.data, { recursive: true })
    fs.mkdirSync(paths.galleries, { recursive: true })
    const now = new Date().toISOString()
    if (!fs.existsSync(paths.manifest)) {
      this.writeJson(paths.manifest, {
        schemaVersion: 1,
        appVersion: this.appVersion,
        createdAt: now,
        updatedAt: now,
      } satisfies WorkspaceManifest)
    }
    if (!fs.existsSync(paths.settings))
      this.writeJson(paths.settings, DEFAULT_WORKSPACE_SETTINGS)
    if (!fs.existsSync(paths.index)) this.writeJson(paths.index, { galleries: {} })
    if (!fs.existsSync(paths.collections)) this.writeJson(paths.collections, [])
    if (!fs.existsSync(paths.schedules)) this.writeJson(paths.schedules, [])
    if (!fs.existsSync(paths.scheduleRuns)) this.writeJson(paths.scheduleRuns, [])
    if (!fs.existsSync(paths.jobs)) this.writeJson(paths.jobs, [])
    if (!fs.existsSync(paths.logs)) fs.writeFileSync(paths.logs, '', 'utf8')
  }

  private normalizeSettings(settings: WorkspaceSettings): WorkspaceSettings {
    return {
      cookies: settings.cookies ?? '',
      proxies: Array.isArray(settings.proxies)
        ? settings.proxies.filter((proxy): proxy is string => typeof proxy === 'string')
        : [],
      scan_thread_cnt: Math.max(1, Math.floor(settings.scan_thread_cnt || 1)),
      download_thread_cnt: Math.max(1, Math.floor(settings.download_thread_cnt || 1)),
      isArchive: Boolean(settings.isArchive),
      archivePassword: settings.archivePassword ?? '',
    }
  }

  private assertCollectionExists(collectionId: string | null): void {
    if (collectionId === null) return
    if (
      !this.listCollections().some(
        (collection) => collection.collectionId === collectionId,
      )
    ) {
      throw new Error('找不到目標 Collection')
    }
  }

  private readIndex(): GalleryIndexFile {
    return this.readJson<GalleryIndexFile>(this.paths().index, { galleries: {} })
  }

  private writeIndex(index: GalleryIndexFile): void {
    this.writeJson(this.paths().index, index)
  }

  private touchManifest(): void {
    const manifest = this.readJson<WorkspaceManifest>(this.paths().manifest)
    manifest.appVersion = this.appVersion
    manifest.updatedAt = new Date().toISOString()
    this.writeJson(this.paths().manifest, manifest)
  }

  private paths(): WorkspacePaths {
    const root = this.requireRoot()
    const data = path.join(root, WORKSPACE_DATA_DIR)
    return {
      data,
      galleries: path.join(root, WORKSPACE_GALLERIES_DIR),
      manifest: path.join(data, 'manifest.json'),
      settings: path.join(data, 'settings.json'),
      index: path.join(data, 'gallery-index.json'),
      collections: path.join(data, 'collections.json'),
      schedules: path.join(data, 'schedules.json'),
      scheduleRuns: path.join(data, 'schedule-runs.json'),
      jobs: path.join(data, 'jobs.json'),
      logs: path.join(data, 'logs.jsonl'),
    }
  }

  private requireRoot(): string {
    if (!this.rootPath) throw new Error('尚未設定工作資料夾')
    return this.rootPath
  }

  private readJson<T>(filePath: string, fallback?: T): T {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
    } catch (error) {
      if (fallback !== undefined) return fallback
      throw error
    }
  }

  private writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
    try {
      fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8')
      fs.renameSync(tempPath, filePath)
    } finally {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true })
    }
  }
}
