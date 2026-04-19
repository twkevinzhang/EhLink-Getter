import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'
import {
  type SidecarAPI,
  type AppConfig,
  type SearchLibraryPayload,
  type FetchedItem,
  type ArchiveProgressEvent,
  type SidecarLogEvent,
  type FetchGalleryResponse,
  type AddToQueuePayload,
  type DownloadJobUpdatedEvent,
} from '@shared/types/api'

const api: SidecarAPI = {
  // config module
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke('save-config', config),
  checkSidecarHealth: () => ipcRenderer.invoke('check-sidecar-health'),
  loginEHentai: () => ipcRenderer.invoke('login-ehentai'),

  // library module
  searchLibrary: (payload: SearchLibraryPayload) =>
    ipcRenderer.invoke('search-library', payload),
  checkLibraryExists: () => ipcRenderer.invoke('check-library-exists'),
  downloadLibrary: () => ipcRenderer.invoke('download-library'),
  onDownloadProgress: (callback: (data: { loaded: number; total: number }) => void) =>
    ipcRenderer.on('download-progress', (_event, value) => callback(value)),
  openFolder: (path?: string) => ipcRenderer.invoke('open-folder', path),

  // fetch module
  fetchPage: (payload: { url: string; next?: string }) =>
    ipcRenderer.invoke('fetch-page', payload),
  fetchGallery: (url: string): Promise<FetchGalleryResponse> =>
    ipcRenderer.invoke('fetch-gallery', url),
  saveCSV: (payload: { path: string; results: FetchedItem[] }) =>
    ipcRenderer.invoke('save-csv', payload),
  saveJSON: (payload: { path: string; data: unknown }) =>
    ipcRenderer.invoke('save-json', payload),
  readJSON: (payload: { path: string }) => ipcRenderer.invoke('read-json', payload),
  downloadImage: (payload: { url: string; savePath: string }) =>
    ipcRenderer.invoke('download-image', payload),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectSavePath: () => ipcRenderer.invoke('select-save-path'),

  // app.vue
  onLog: (callback: (log: SidecarLogEvent) => void) =>
    ipcRenderer.on('python-log', (_event, value) => callback(value)),

  // download module
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  getJobs: () => ipcRenderer.invoke('get-jobs'),
  addToQueue: (payload: AddToQueuePayload) => ipcRenderer.invoke('add-to-queue', payload),
  startJob: (jobId: string) => ipcRenderer.invoke('start-job', jobId),
  pauseJob: (jobId: string) => ipcRenderer.invoke('pause-job', jobId),
  stopJob: (jobId: string) => ipcRenderer.invoke('stop-job', jobId),
  restartJob: (jobId: string) => ipcRenderer.invoke('restart-job', jobId),
  clearFinishedJobs: () => ipcRenderer.invoke('clear-finished-jobs'),
  onDownloadJobUpdated: (callback: (event: DownloadJobUpdatedEvent) => void) =>
    ipcRenderer.on('download-job-updated', (_event, value) => callback(value)),
  onArchiveProgress: (callback: (data: ArchiveProgressEvent) => void) =>
    ipcRenderer.on('archive-progress', (_event, value) => callback(value)),

  // electron-storage composable
  storeGet: <T extends unknown = unknown>(key: string) =>
    ipcRenderer.invoke('electron-store-get', key) as Promise<T>,
  storeSet: (key: string, val: unknown) =>
    ipcRenderer.invoke('electron-store-set', key, val),

  // scheduler module
  triggerSchedulerTask: (taskId: string) =>
    ipcRenderer.invoke('trigger-scheduler-task', taskId),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    exposeElectronAPI()
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
