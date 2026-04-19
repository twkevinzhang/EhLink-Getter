import type { LogEntry } from './log'

export interface DownloadGallery {
  gid: string
  title: string
  link: string
  targetPath: string
  isArchive: boolean
  imageCount: number
  status: string
  progress: number
  mode: 'running' | 'paused' | 'error' | 'completed' | 'pending'
  password?: string
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
  imageCount?: number
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

/** Library 模組 Response */
export interface SearchLibraryResponse {
  results: LibraryGallery[]
  error?: string
}

export interface CheckLibraryExistsResponse {
  success: boolean
  exists: boolean
}

export interface DownloadLibraryResponse {
  success: boolean
  path?: string
  error?: string
}

/** Fetch 模組 Response */
export interface FetchPageResponse {
  items: FetchedItem[]
  next?: string
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
export interface DownloadGalleryPayload {
  gallery: DownloadGallery
  isArchive: boolean
  password: string
}

export interface DownloadGalleryResponse {
  success: boolean
  path?: string
  error?: string
}

export interface GetDownloadsPathResponse {
  success: boolean
  path: string
}

/** Scheduler 模組 Response */
export interface TriggerSchedulerResponse {
  success: boolean
  error?: string
}

/** onDownloadStatusUpdate 事件資料 */
export interface DownloadStatusEvent {
  url: string
  progress?: number
  status?: string
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
  onDownloadProgress: (
    callback: (data: { loaded: number; total: number }) => void,
  ) => void
  openFolder: (path?: string) => Promise<void>

  // fetch
  fetchPage: (payload: { url: string; next?: string }) => Promise<FetchPageResponse>
  saveCSV: (payload: {
    path: string
    results: FetchedItem[]
  }) => Promise<SaveCSVResponse>
  saveJSON: (payload: {
    path: string
    data: unknown
  }) => Promise<SaveJSONResponse>
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
  onArchiveProgress: (callback: (data: ArchiveProgressEvent) => void) => void
  downloadGallery: (payload: DownloadGalleryPayload) => Promise<DownloadGalleryResponse>
  onDownloadStatusUpdate: (callback: (data: DownloadStatusEvent) => void) => void

  // electron-storage
  storeGet: <T = unknown>(key: string) => Promise<T>
  storeSet: (key: string, val: unknown) => Promise<void>

  // scheduler
  triggerSchedulerTask: (taskId: string) => Promise<TriggerSchedulerResponse>
}
