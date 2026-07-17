import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'
import {
  type SidecarAPI,
  type AppConfig,
  type SearchLibraryPayload,
  type ArchiveProgressEvent,
  type SidecarLogEvent,
  type AddToQueuePayload,
  type ManualDownloadPayload,
  type ManualDownloadResult,
  type DownloadJobUpdatedEvent,
  type LibraryProgressEvent,
  type WorkspaceResponse,
  type WorkspaceSettings,
  type WorkspaceSettingsResponse,
  type WorkspaceState,
  type CreateCollectionPayload,
  type UpdateCollectionPayload,
  type AddBooksToCollectionsPayload,
  type CreateSchedulePayload,
  type UpdateSchedulePayload,
  type ScheduleRun,
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
  onLibraryProgress: (callback: (data: LibraryProgressEvent) => void) =>
    ipcRenderer.on('library-progress', (_event, value) => callback(value)),
  openFolder: (path?: string) => ipcRenderer.invoke('open-folder', path),

  // app.vue
  onLog: (callback: (log: SidecarLogEvent) => void) =>
    ipcRenderer.on('python-log', (_event, value) => callback(value)),

  // download module
  getJobs: () => ipcRenderer.invoke('get-jobs'),
  manualDownloadBatch: (payload: ManualDownloadPayload): Promise<ManualDownloadResult> =>
    ipcRenderer.invoke('manual-download-batch', payload),
  addToQueue: (payload: AddToQueuePayload) => ipcRenderer.invoke('add-to-queue', payload),
  startJob: (jobId: string) => ipcRenderer.invoke('start-job', jobId),
  pauseJob: (jobId: string) => ipcRenderer.invoke('pause-job', jobId),
  stopJob: (jobId: string) => ipcRenderer.invoke('stop-job', jobId),
  stopAllJobs: () => ipcRenderer.invoke('stop-all-jobs'),
  restartJob: (jobId: string) => ipcRenderer.invoke('restart-job', jobId),
  removeJob: (jobId: string) => ipcRenderer.invoke('remove-job', jobId),
  clearFinishedJobs: () => ipcRenderer.invoke('clear-finished-jobs'),
  onDownloadJobUpdated: (callback: (event: DownloadJobUpdatedEvent) => void) =>
    ipcRenderer.on('download-job-updated', (_event, value) => callback(value)),
  onArchiveProgress: (callback: (data: ArchiveProgressEvent) => void) =>
    ipcRenderer.on('archive-progress', (_event, value) => callback(value)),

  // workspace module
  getWorkspaceState: async (): Promise<WorkspaceState> => {
    const response = (await ipcRenderer.invoke(
      'get-workspace-state',
    )) as WorkspaceResponse
    if (!response.success) throw new Error(response.error ?? '無法讀取工作資料夾')
    return response.state ?? { configured: false, path: null }
  },
  selectWorkspace: async (): Promise<WorkspaceState> => {
    const response = (await ipcRenderer.invoke('select-workspace')) as WorkspaceResponse
    if (!response.success) throw new Error(response.error ?? '無法設定工作資料夾')
    return response.state ?? { configured: false, path: null }
  },
  getWorkspaceSettings: async (): Promise<WorkspaceSettings> => {
    const response = (await ipcRenderer.invoke(
      'get-workspace-settings',
    )) as WorkspaceSettingsResponse
    if (!response.success || !response.settings) {
      throw new Error(response.error ?? '無法讀取工作資料夾設定')
    }
    return response.settings
  },
  saveWorkspaceSettings: async (
    settings: WorkspaceSettings,
  ): Promise<WorkspaceSettings> => {
    const response = (await ipcRenderer.invoke(
      'save-workspace-settings',
      settings,
    )) as WorkspaceSettingsResponse
    if (!response.success || !response.settings) {
      throw new Error(response.error ?? '無法儲存工作資料夾設定')
    }
    return response.settings
  },
  onWorkspaceUpdated: (callback: (state: WorkspaceState) => void) => {
    const listener = (_event: IpcRendererEvent, state: WorkspaceState) => callback(state)
    ipcRenderer.on('workspace-updated', listener)
    return () => ipcRenderer.removeListener('workspace-updated', listener)
  },

  // managed gallery and collection modules
  listManagedGalleries: () => ipcRenderer.invoke('list-managed-galleries'),
  listCollections: () => ipcRenderer.invoke('list-collections'),
  createCollection: (payload: CreateCollectionPayload) =>
    ipcRenderer.invoke('create-collection', payload),
  updateCollection: (payload: UpdateCollectionPayload) =>
    ipcRenderer.invoke('update-collection', payload),
  deleteCollection: (collectionId: string) =>
    ipcRenderer.invoke('delete-collection', collectionId),
  addBooksToCollections: (payload: AddBooksToCollectionsPayload) =>
    ipcRenderer.invoke('add-books-to-collections', payload),
  removeBookFromCollection: (gid: string, collectionId: string) =>
    ipcRenderer.invoke('remove-book-from-collection', { gid, collectionId }),

  // scheduler module
  listSchedules: () => ipcRenderer.invoke('list-schedules'),
  listScheduleRuns: (scheduleId?: string) =>
    ipcRenderer.invoke('list-schedule-runs', scheduleId),
  getActiveScheduleRuns: () => ipcRenderer.invoke('get-active-schedule-runs'),
  createSchedule: (payload: CreateSchedulePayload) =>
    ipcRenderer.invoke('create-schedule', payload),
  updateSchedule: (payload: UpdateSchedulePayload) =>
    ipcRenderer.invoke('update-schedule', payload),
  deleteSchedule: (scheduleId: string) =>
    ipcRenderer.invoke('delete-schedule', scheduleId),
  runScheduleNow: (scheduleId: string) =>
    ipcRenderer.invoke('run-schedule-now', scheduleId),
  pauseScheduleDownloads: (scheduleId: string) =>
    ipcRenderer.invoke('pause-schedule-downloads', scheduleId),
  resumeScheduleDownloads: (scheduleId: string) =>
    ipcRenderer.invoke('resume-schedule-downloads', scheduleId),
  onScheduleRunProgress: (callback: (run: ScheduleRun) => void) => {
    const listener = (_event: IpcRendererEvent, run: ScheduleRun) => callback(run)
    ipcRenderer.on('schedule-run-progress', listener)
    return () => ipcRenderer.removeListener('schedule-run-progress', listener)
  },
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
