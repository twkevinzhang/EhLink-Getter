import { ElectronAPI } from "@electron-toolkit/preload";

interface SidecarAPI {
  startFavoritesTask: () => Promise<{ success: boolean; error?: string }>;
  searchMetadata: (query: string) => Promise<{ results: any[] }>;
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
