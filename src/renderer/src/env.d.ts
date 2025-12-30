import { ElectronAPI } from "@electron-toolkit/preload";

interface SidecarAPI {
  startFavoritesTask: (
    outputPath?: string
  ) => Promise<{ success: boolean; error?: string }>;
  stopFavoritesTask: () => Promise<{ success: boolean; error?: string }>;
  searchMetadata: (query: string) => Promise<{ results: any[] }>;
  mapMetadata: (payload: any) => Promise<{ results: any[]; error?: string }>;
  saveConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
  selectDirectory: () => Promise<string | null>;
  openFolder: (path?: string) => Promise<void>;
  onLog: (callback: (log: any) => void) => void;
  onProgress: (callback: (data: any) => void) => void;
  onTaskComplete: (callback: (data: any) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: SidecarAPI;
  }
}
