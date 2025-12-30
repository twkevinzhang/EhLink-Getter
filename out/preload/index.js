"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  startFavoritesTask: () => electron.ipcRenderer.invoke("start-favorites-task"),
  searchMetadata: (query) => electron.ipcRenderer.invoke("search-metadata", query),
  saveConfig: (config) => electron.ipcRenderer.invoke("save-config", config),
  selectDirectory: () => electron.ipcRenderer.invoke("select-directory"),
  openFolder: (path) => electron.ipcRenderer.invoke("open-folder", path),
  onLog: (callback) => electron.ipcRenderer.on("python-log", (_event, value) => callback(value)),
  onProgress: (callback) => electron.ipcRenderer.on("python-progress", (_event, value) => callback(value)),
  onTaskComplete: (callback) => electron.ipcRenderer.on("python-task-complete", (_event, value) => callback(value))
};
if (process.contextIsolated) {
  try {
    preload.exposeElectronAPI();
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;
  window.api = api;
}
