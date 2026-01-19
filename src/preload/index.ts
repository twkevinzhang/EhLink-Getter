import { contextBridge, ipcRenderer } from "electron";
import { exposeElectronAPI } from "@electron-toolkit/preload";

// Custom APIs for renderer
const api = {
  getConfig: () => ipcRenderer.invoke("get-config"),
  searchMetadata: (query: string) =>
    ipcRenderer.invoke("search-metadata", query),
  mapMetadata: (payload: any) => ipcRenderer.invoke("map-metadata", payload),
  saveConfig: (config: any) => ipcRenderer.invoke("save-config", config),
  fetchPage: (payload: { url: string; next?: string }) =>
    ipcRenderer.invoke("fetch-page", payload),
  saveCSV: (payload: { path: string; results: any[] }) =>
    ipcRenderer.invoke("save-csv", JSON.parse(JSON.stringify(payload))),
  saveJSON: (payload: { path: string; data: any }) =>
    ipcRenderer.invoke("save-json", JSON.parse(JSON.stringify(payload))),
  readJSON: (payload: { path: string }) =>
    ipcRenderer.invoke("read-json", payload),
  startDownload: (payload: { jobId: string; images: any[] }) =>
    ipcRenderer.invoke("start-download", payload),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  selectSavePath: () => ipcRenderer.invoke("select-save-path"),
  openFolder: (path?: string) => ipcRenderer.invoke("open-folder", path),
  onLog: (callback: any) =>
    ipcRenderer.on("python-log", (_event, value) => callback(value)),
  onProgress: (callback: any) =>
    ipcRenderer.on("python-progress", (_event, value) => callback(value)),
  onTaskComplete: (callback: any) =>
    ipcRenderer.on("python-task-complete", (_event, value) => callback(value)),
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    exposeElectronAPI();
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
