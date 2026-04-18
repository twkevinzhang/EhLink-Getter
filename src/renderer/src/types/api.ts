// src/renderer/src/types/api.ts
import type { LibraryGallery } from '@renderer/stores/library'
import type { DownloadGallery } from '@renderer/stores/download'
import type { ScheduledTask } from '@renderer/stores/scheduler'
import type { LogEntry } from '@renderer/types/log'

/** 單筆 gallery 清單項目（fetchPage 回傳的原始資料） */
export interface FetchedItem {
  gid: string
  token: string
  title: string
  link: string
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

/** searchLibrary IPC response */
export interface SearchLibraryResponse {
  results: LibraryGallery[]
  error?: string
}

/** downloadGallery IPC payload */
export interface DownloadGalleryPayload {
  gallery: DownloadGallery
  isArchive: boolean
  password: string
}

/** downloadGallery IPC response */
export interface DownloadGalleryResponse {
  success: boolean
  path?: string
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

/** triggerSchedulerTask IPC response */
export interface TriggerSchedulerResponse {
  success: boolean
  error?: string
}

/** scheduler-updated IPC event payload */
export interface SchedulerUpdatedEvent {
  tasks: ScheduledTask[]
}
