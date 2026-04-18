// src/renderer/src/env.d.ts
import { type ElectronAPI } from '@electron-toolkit/preload'
import type {
  FetchPageResponse,
  FetchedItem,
  SearchLibraryPayload,
  SearchLibraryResponse,
  DownloadGalleryPayload,
  DownloadGalleryResponse,
  DownloadStatusEvent,
  ArchiveProgressEvent,
  SidecarLogEvent,
  TriggerSchedulerResponse,
} from '@renderer/types/api'
import type { AppConfig } from '@shared/utilities'

interface SidecarAPI {
  // config
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<{ success: boolean; error?: string }>
  checkSidecarHealth: () => Promise<{ success: boolean }>
  loginEHentai: () => Promise<{ success: boolean; cookies?: string; error?: string }>

  // library
  searchLibrary: (payload: SearchLibraryPayload) => Promise<SearchLibraryResponse>
  checkLibraryExists: () => Promise<boolean>
  downloadLibrary: () => Promise<{ success: boolean; path?: string; error?: string }>
  onDownloadProgress: (
    callback: (data: { loaded: number; total: number }) => void,
  ) => void
  openFolder: (path?: string) => Promise<void> // NOTE: semantically should be openExternal, renamed in Task 13

  // fetch
  fetchPage: (payload: { url: string; next?: string }) => Promise<FetchPageResponse>
  saveCSV: (payload: {
    path: string
    results: FetchedItem[]
  }) => Promise<{ status: string; path: string; error?: string }>
  saveJSON: (payload: {
    path: string
    data: unknown
  }) => Promise<{ status: string; path: string; error?: string }>
  readJSON: (payload: { path: string }) => Promise<{
    success: boolean
    data?: unknown
    error?: string
    code?: string
  }>
  downloadImage: (payload: {
    url: string
    savePath: string
  }) => Promise<{ success: boolean; error?: string }>
  selectDirectory: () => Promise<string | null>
  selectSavePath: () => Promise<string | null>

  // events
  onLog: (callback: (log: SidecarLogEvent) => void) => void

  // download
  getDownloadsPath: () => Promise<string>
  onArchiveProgress: (callback: (data: ArchiveProgressEvent) => void) => void
  downloadGallery: (payload: DownloadGalleryPayload) => Promise<DownloadGalleryResponse>
  onDownloadStatusUpdate: (callback: (data: DownloadStatusEvent) => void) => void

  // electron-storage
  storeGet: <T = unknown>(key: string) => Promise<T>
  storeSet: (key: string, val: unknown) => Promise<void>

  // scheduler
  triggerSchedulerTask: (taskId: string) => Promise<TriggerSchedulerResponse>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SidecarAPI
  }
}
