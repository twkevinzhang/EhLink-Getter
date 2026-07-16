import type { LogEntry } from './log'

export interface DownloadGallery {
  gid: string
  token?: string
  title: string
  link: string
  targetPath: string
  isArchive: boolean
  imagecount: number
  status: string
  progress: number
  mode: 'running' | 'paused' | 'error' | 'completed' | 'pending' | 'stopped'
  password?: string
  image_links?: string[]
  collectionIds?: string[]
}

export interface JobState {
  jobId: string
  title: string
  progress: number
  status: string
  mode: 'running' | 'paused' | 'error' | 'completed' | 'pending' | 'stopped'
  galleries: DownloadGallery[]
  isExpanded?: boolean
  isArchive?: boolean
  password?: string
  origin?: 'manual' | 'schedule'
  scheduleId?: string
  scheduleRunId?: string
  targetCollectionIds?: string[]
  /** All schedules that contributed galleries to this (possibly merged) job. */
  sourceScheduleIds?: string[]
  /** True when a manual request was merged into this job. */
  hasManualSource?: boolean
  /** Set only for jobs paused by their owning schedule. */
  pausedByScheduleId?: string
}

export interface AddToQueuePayload {
  jobId: string
  title: string
  galleries: DownloadGallery[]
  isArchive?: boolean
  password?: string
  origin?: 'manual' | 'schedule'
  scheduleId?: string
  scheduleRunId?: string
  targetCollectionIds?: string[]
}

export interface DownloadJobUpdatedEvent {
  job: JobState
}

export interface LibraryGallery {
  gid?: string
  token?: string
  title: string
  link: string
  rating?: string | number
  category?: string
  thumb?: string
  language?: string
  posted?: string | number
  uploader?: string
  tags?: string[]
  expunged?: boolean
}

export interface AppConfig {
  cookies: string
  proxies: string[]
  scan_thread_cnt: number
  download_thread_cnt: number
}

export type ManagedGalleryStatus =
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'error'
  | 'stopped'

/**
 * A gallery becomes managed only when a download actually starts. Search and
 * schedule discovery results intentionally use FetchedItem instead.
 */
export interface ManagedGallery {
  gid: string
  token: string
  title: string
  link: string
  imagecount?: number
  thumb?: string
  category?: string
  rating?: string
  posted?: string
  localPath: string
  status: ManagedGalleryStatus
  progress: number
  error?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface UpsertGalleryPayload {
  gid: string
  token?: string
  title: string
  link: string
  imagecount?: number
  thumb?: string
  category?: string
  rating?: string
  posted?: string
  status?: ManagedGalleryStatus
  progress?: number
  error?: string
  startedAt?: string
  completedAt?: string
}

export type UpsertGalleryInput = UpsertGalleryPayload

export type UpdateGalleryStatusPatch = Partial<
  Pick<ManagedGallery, 'progress' | 'error' | 'startedAt' | 'completedAt'>
>

export interface CollectionBookRef {
  gid: string
  addedAt: string
}

/** User-created collections only. "Uncategorized" is a dynamic query. */
export interface Collection {
  collectionId: string
  name: string
  position: number
  coverGid?: string
  books: CollectionBookRef[]
  createdAt: string
  updatedAt: string
}

export type ScheduleRunStatus = 'running' | 'success' | 'error' | 'cancelled'
export type ScheduleRunTrigger = 'cron' | 'manual' | 'catch-up'

export interface Schedule {
  scheduleId: string
  name: string
  monitorUrl: string
  canonicalUrl: string
  query: string
  cronExpression: string
  pageLimit: number
  /** null means the dynamic "Uncategorized" collection. */
  targetCollectionId: string | null
  enabled: boolean
  /** Pauses downloads only; monitoring and manual scans remain available. */
  downloadsPaused: boolean
  createdAt: string
  updatedAt: string
  lastRunAt?: string
  lastRunStatus?: Exclude<ScheduleRunStatus, 'running'>
  lastRunMessage?: string
}

export interface ScheduleRunSnapshot {
  name: string
  monitorUrl: string
  canonicalUrl: string
  query: string
  cronExpression: string
  pageLimit: number
  targetCollectionId: string | null
}

export interface ScheduleRunCounters {
  discovered: number
  queued: number
  existingGalleryAdded: number
  merged: number
  ignored: number
}

export interface ScheduleRun {
  runId: string
  scheduleId: string
  trigger: ScheduleRunTrigger
  status: ScheduleRunStatus
  snapshot: ScheduleRunSnapshot
  currentPage: number
  totalPages?: number
  currentGid?: string
  counters: ScheduleRunCounters
  startedAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface WorkspaceSettings extends AppConfig {
  isArchive: boolean
  archivePassword: string
}

export interface WorkspaceManifest {
  schemaVersion: 1
  appVersion: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceState {
  configured: boolean
  path: string | null
  manifest?: WorkspaceManifest
}

export interface SetWorkspacePayload {
  path: string
}

export interface CreateCollectionPayload {
  name: string
}

export interface UpdateCollectionPayload {
  collectionId: string
  name?: string
  coverGid?: string | null
}

export interface AddBooksToCollectionsPayload {
  gids: string[]
  collectionIds: string[]
}

export interface RemoveBookFromCollectionPayload {
  gid: string
  collectionId: string
}

export interface CreateSchedulePayload {
  name: string
  monitorUrl: string
  cronExpression: string
  pageLimit?: number
  targetCollectionId?: string | null
  enabled?: boolean
}

export interface UpdateSchedulePayload extends Partial<
  Omit<CreateSchedulePayload, 'targetCollectionId'>
> {
  scheduleId: string
  targetCollectionId?: string | null
}

export interface WorkspaceResponse {
  success: boolean
  state?: WorkspaceState
  error?: string
}

export interface WorkspaceSettingsResponse {
  success: boolean
  settings?: WorkspaceSettings
  error?: string
}

export interface GalleriesResponse {
  success: boolean
  galleries: ManagedGallery[]
  error?: string
}

export interface CollectionsResponse {
  success: boolean
  collections: Collection[]
  error?: string
}

export interface CollectionResponse {
  success: boolean
  collection?: Collection
  error?: string
}

export interface SchedulesResponse {
  success: boolean
  schedules: Schedule[]
  error?: string
}

export interface ScheduleResponse {
  success: boolean
  schedule?: Schedule
  error?: string
}

export interface ScheduleRunsResponse {
  success: boolean
  runs: ScheduleRun[]
  error?: string
}

/** 單筆 gallery 清單項目（fetchPage 回傳的原始資料） */
export interface FetchedItem {
  gid: string
  token: string
  title: string
  link: string
  imagecount?: number
  thumb?: string
  category?: string
  rating?: string
  posted?: string
}

/** fetchPage IPC response */
export interface FetchPageResponse {
  items: FetchedItem[]
  next?: string
  error?: string
}

/** searchLibrary IPC payload */
export interface SearchLibraryPayload {
  keywords: string
  fields: string[]
  minRating?: number
  includeExpunged?: boolean
}

/** Config 模組 Response */
export interface GetConfigResponse {
  success: boolean
  config?: AppConfig
  error?: string
}

export interface SaveConfigResponse {
  success: boolean
  error?: string
}

export interface CheckSidecarHealthResponse {
  success: boolean
}

export interface LoginEHentaiResponse {
  success: boolean
  cookies?: string
  error?: string
}

/** library-progress IPC push event */
export interface LibraryProgressEvent {
  phase: 'download' | 'import' | 'index'
  /** 0-100。index 階段：開始為 0，完成為 100 */
  progress: number
}

/** Library 模組 Response */
export interface SearchLibraryResponse {
  results: LibraryGallery[]
  error?: string
}

export interface CheckLibraryExistsResponse {
  exists: boolean
}

export interface DownloadLibraryResponse {
  success: boolean
  path?: string
  error?: string
}

/** onLibraryProgress IPC-event payload */
export interface LibraryProgressPayload {
  phase: 'download' | 'import' | 'index'
  progress: number
}

/** Fetch 模組 Response */
export interface FetchGalleryResponse {
  item?: FetchedItem
  error?: string
}

export interface SaveCSVResponse {
  status: 'saved' | 'error'
  path: string
  error?: string
}

export interface SaveJSONResponse {
  status: 'saved' | 'error'
  path: string
  error?: string
}

export interface ReadJSONResponse {
  success: boolean
  data?: unknown
  error?: string
  code?: string
}

export interface DownloadImageResponse {
  success: boolean
  error?: string
}

export interface SelectDirectoryResponse {
  success: boolean
  path: string | null
}

export interface SelectSavePathResponse {
  success: boolean
  path: string | null
}

/** Download 模組 Response */
export interface GetDownloadsPathResponse {
  success: boolean
  path: string
}

/** onArchiveProgress 事件資料（含 jobId 以便正確對應） */
export interface ArchiveProgressEvent {
  jobId: string
  progress: number
}

/** onLog 事件資料（從 sidecar 收到的原始事件，無 timestamp） */
export type SidecarLogEvent = Omit<LogEntry, 'timestamp'>

export interface SidecarAPI {
  // config
  getConfig: () => Promise<GetConfigResponse>
  saveConfig: (config: AppConfig) => Promise<SaveConfigResponse>
  checkSidecarHealth: () => Promise<CheckSidecarHealthResponse>
  loginEHentai: () => Promise<LoginEHentaiResponse>

  // library
  searchLibrary: (payload: SearchLibraryPayload) => Promise<SearchLibraryResponse>
  checkLibraryExists: () => Promise<CheckLibraryExistsResponse>
  downloadLibrary: () => Promise<DownloadLibraryResponse>
  onLibraryProgress: (callback: (data: LibraryProgressEvent) => void) => void
  openFolder: (path?: string) => Promise<void>

  // fetch
  fetchPage: (payload: { url: string; next?: string }) => Promise<FetchPageResponse>
  fetchGallery: (url: string) => Promise<FetchGalleryResponse>
  saveCSV: (payload: { path: string; results: FetchedItem[] }) => Promise<SaveCSVResponse>
  saveJSON: (payload: { path: string; data: unknown }) => Promise<SaveJSONResponse>
  readJSON: (payload: { path: string }) => Promise<ReadJSONResponse>
  downloadImage: (payload: {
    url: string
    savePath: string
  }) => Promise<DownloadImageResponse>
  selectDirectory: () => Promise<SelectDirectoryResponse>
  selectSavePath: () => Promise<SelectSavePathResponse>

  // events
  onLog: (callback: (log: SidecarLogEvent) => void) => void

  // download
  getDownloadsPath: () => Promise<GetDownloadsPathResponse>
  getJobs: () => Promise<JobState[]>
  addToQueue: (payload: AddToQueuePayload) => Promise<void>
  startJob: (jobId: string) => Promise<void>
  pauseJob: (jobId: string) => Promise<void>
  stopJob: (jobId: string) => Promise<void>
  restartJob: (jobId: string) => Promise<void>
  removeJob: (jobId: string) => Promise<void>
  clearFinishedJobs: () => Promise<void>
  onDownloadJobUpdated: (callback: (event: DownloadJobUpdatedEvent) => void) => void
  onArchiveProgress: (callback: (data: ArchiveProgressEvent) => void) => void

  // workspace
  getWorkspaceState: () => Promise<WorkspaceState>
  selectWorkspace: () => Promise<WorkspaceState>
  getWorkspaceSettings: () => Promise<WorkspaceSettings>
  saveWorkspaceSettings: (settings: WorkspaceSettings) => Promise<WorkspaceSettings>
  onWorkspaceUpdated: (callback: (state: WorkspaceState) => void) => () => void

  // managed galleries and collections
  listManagedGalleries: () => Promise<ManagedGallery[]>
  listCollections: () => Promise<Collection[]>
  createCollection: (payload: CreateCollectionPayload) => Promise<Collection>
  updateCollection: (payload: UpdateCollectionPayload) => Promise<Collection>
  deleteCollection: (collectionId: string) => Promise<void>
  addBooksToCollections: (
    payload: AddBooksToCollectionsPayload,
  ) => Promise<{ added: number; existing: number }>
  removeBookFromCollection: (gid: string, collectionId: string) => Promise<void>

  // electron-storage
  storeGet: <T = unknown>(key: string) => Promise<T>
  storeSet: (key: string, val: unknown) => Promise<void>

  // scheduler
  listSchedules: () => Promise<Schedule[]>
  listScheduleRuns: (scheduleId?: string) => Promise<ScheduleRun[]>
  getActiveScheduleRuns: () => Promise<ScheduleRun[]>
  createSchedule: (payload: CreateSchedulePayload) => Promise<Schedule>
  updateSchedule: (payload: UpdateSchedulePayload) => Promise<Schedule>
  deleteSchedule: (scheduleId: string) => Promise<void>
  runScheduleNow: (scheduleId: string) => Promise<ScheduleRun>
  pauseScheduleDownloads: (scheduleId: string) => Promise<Schedule>
  resumeScheduleDownloads: (scheduleId: string) => Promise<Schedule>
  onScheduleRunProgress: (callback: (run: ScheduleRun) => void) => () => void
}
