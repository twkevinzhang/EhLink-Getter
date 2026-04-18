import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'

const api = {
  // config module
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  checkSidecarHealth: () => ipcRenderer.invoke('check-sidecar-health'),
  loginEHentai: () => ipcRenderer.invoke('login-ehentai'),

  // library module
  searchLibrary: (payload: any) => ipcRenderer.invoke('search-library', payload),
  checkLibraryExists: () => ipcRenderer.invoke('check-library-exists'),
  downloadLibrary: () => ipcRenderer.invoke('download-library'),
  onDownloadProgress: (callback: any) =>
    ipcRenderer.on('download-progress', (_event, value) => callback(value)),
  openFolder: (path?: string) => ipcRenderer.invoke('open-folder', path),

  // fetch module
  fetchPage: (payload: { url: string; next?: string }) =>
    ipcRenderer.invoke('fetch-page', payload),
  saveCSV: (payload: { path: string; results: any[] }) =>
    ipcRenderer.invoke('save-csv', payload),
  saveJSON: (payload: { path: string; data: any }) =>
    ipcRenderer.invoke('save-json', payload),
  readJSON: (payload: { path: string }) => ipcRenderer.invoke('read-json', payload),
  downloadImage: (payload: { url: string; savePath: string }) =>
    ipcRenderer.invoke('download-image', payload),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectSavePath: () => ipcRenderer.invoke('select-save-path'),

  // app.vue
  onLog: (callback: any) =>
    ipcRenderer.on('python-log', (_event, value) => callback(value)),
  onProgress: (callback: any) =>
    ipcRenderer.on('python-progress', (_event, value) => callback(value)),

  // download module
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  onArchiveProgress: (callback: any) =>
    ipcRenderer.on('archive-progress', (_event, value) => callback(value)),
  downloadGallery: (payload: any) => ipcRenderer.invoke('download-gallery', payload),
  onDownloadStatusUpdate: (callback: any) =>
    ipcRenderer.on('download-status-update', (_event, value) => callback(value)),

  // electron-storage composable
  storeGet: (key: string) => ipcRenderer.invoke('electron-store-get', key),
  storeSet: (key: string, val: any) => ipcRenderer.invoke('electron-store-set', key, val),

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
