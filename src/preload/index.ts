import { contextBridge, ipcRenderer } from "electron";
import { exposeElectronAPI } from "@electron-toolkit/preload";

// Custom APIs for renderer
const api = {
  startFavoritesTask: () => ipcRenderer.invoke("start-favorites-task"),
  searchMetadata: (query: string) =>
    ipcRenderer.invoke("search-metadata", query),
  saveConfig: (config: any) => ipcRenderer.invoke("save-config", config),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
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
