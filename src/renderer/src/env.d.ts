import { type ElectronAPI } from '@electron-toolkit/preload'

interface SidecarAPI {
  // config module
  getConfig: () => Promise<any>
  saveConfig: (config: any) => Promise<{ success: boolean; error?: string }>
  checkSidecarHealth: () => Promise<{ success: boolean }>
  loginEHentai: () => Promise<{ success: boolean; cookies?: string; error?: string }>

  // library module
  searchLibrary: (payload: any) => Promise<{ results: any[]; error?: string }>
  checkLibraryExists: () => Promise<boolean>
  downloadLibrary: () => Promise<{ success: boolean; path?: string; error?: string }>
  onDownloadProgress: (
    callback: (data: { loaded: number; total: number }) => void,
  ) => void
  openFolder: (path?: string) => Promise<void>

  // fetch module
  fetchPage: (payload: {
    url: string
    next?: string
  }) => Promise<{ items: any[]; next?: string; error?: string }>
  saveCSV: (payload: {
    path: string
    results: any[]
  }) => Promise<{ status: string; path: string; error?: string }>
  saveJSON: (payload: {
    path: string
    data: any
  }) => Promise<{ status: string; path: string; error?: string }>
  readJSON: (payload: { path: string }) => Promise<{
    success: boolean
    data?: any
    error?: string
    code?: string
  }>
  downloadImage: (payload: {
    url: string
    savePath: string
  }) => Promise<{ success: boolean; error?: string }>
  selectDirectory: () => Promise<string | null>
  selectSavePath: () => Promise<string | null>

  // app.vue
  onLog: (callback: (log: any) => void) => void
  onProgress: (callback: (data: any) => void) => void

  // download module
  getDownloadsPath: () => Promise<string>
  onArchiveProgress: (callback: (data: any) => void) => void
  downloadGallery: (
    payload: any,
  ) => Promise<{ success: boolean; path?: string; error?: string }>
  onDownloadStatusUpdate: (callback: (data: any) => void) => void

  // electron-storage composable
  storeGet: (key: string) => Promise<any>
  storeSet: (key: string, val: any) => Promise<void>

  // scheduler module
  triggerSchedulerTask: (taskId: string) => Promise<any>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SidecarAPI
  }
}
