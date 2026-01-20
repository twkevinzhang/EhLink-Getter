import { ElectronAPI } from "@electron-toolkit/preload";

interface SidecarAPI {
  getConfig: () => Promise<any>;
  checkSidecarHealth: () => Promise<{ success: boolean }>;
  searchMetadata: (query: string) => Promise<{ results: any[] }>;
  mapMetadata: (payload: any) => Promise<{ results: any[]; error?: string }>;
  saveConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
  fetchPage: (payload: {
    url: string;
    next?: string;
  }) => Promise<{ items: any[]; next?: string; error?: string }>;
  saveCSV: (payload: {
    path: string;
    results: any[];
  }) => Promise<{ status: string; path: string; error?: string }>;
  saveJSON: (payload: {
    path: string;
    data: any;
  }) => Promise<{ status: string; path: string; error?: string }>;
  readJSON: (payload: { path: string }) => Promise<{
    success: boolean;
    data?: any;
    error?: string;
    code?: string;
  }>;
  downloadImage: (payload: {
    url: string;
    savePath: string;
  }) => Promise<{ success: boolean; error?: string }>;
  selectDirectory: () => Promise<string | null>;
  selectSavePath: () => Promise<string | null>;
  openFolder: (path?: string) => Promise<void>;
  onLog: (callback: (log: any) => void) => void;
  onProgress: (callback: (data: any) => void) => void;
  onTaskComplete: (callback: (data: any) => void) => void;
  getUserDataPath: () => Promise<string>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: SidecarAPI;
  }
}
