import type { LogEntry } from './log'

export interface DownloadGallery {
  gid: string
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
}

export interface AddToQueuePayload {
  jobId: string
  title: string
  galleries: DownloadGallery[]
  isArchive?: boolean
  password?: string
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

export interface ScheduledTask {
  taskId: string
  link: string
  fromPage: number
  toPage: number | string
  scheduleTime: string
  templatePath?: string
  isArchive?: boolean
  archivePassword?: string
  lastRun?: string
  status: 'enabled' | 'disabled' | 'running'
  executionCount: number
  downloadedCount: number
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

/** Scheduler 模組 Response */
export interface TriggerSchedulerResponse {
  success: boolean
  error?: string
}

/** onArchiveProgress 事件資料（含 jobId 以便正確對應） */
export interface ArchiveProgressEvent {
  jobId: string
  progress: number
}

/** onLog 事件資料（從 sidecar 收到的原始事件，無 timestamp） */
export type SidecarLogEvent = Omit<LogEntry, 'timestamp'>

/** scheduler-updated IPC event payload */
export interface SchedulerUpdatedEvent {
  tasks: ScheduledTask[]
}

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

  // electron-storage
  storeGet: <T = unknown>(key: string) => Promise<T>
  storeSet: (key: string, val: unknown) => Promise<void>

  // scheduler
  triggerSchedulerTask: (taskId: string) => Promise<TriggerSchedulerResponse>
}
