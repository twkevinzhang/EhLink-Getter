import { ElectronAPI } from "@electron-toolkit/preload";

interface SidecarAPI {
  startFavoritesTask: (
    outputPath?: string
  ) => Promise<{ success: boolean; error?: string }>;
  stopFavoritesTask: () => Promise<{ success: boolean; error?: string }>;
  searchMetadata: (query: string) => Promise<{ results: any[] }>;
  mapMetadata: (payload: any) => Promise<{ results: any[]; error?: string }>;
  saveConfig: (config: any) => Promise<{ success: boolean; error?: string }>;
  getFavoritesPages: () => Promise<{ pages: number; error?: string }>;
  fetchFavoritesPage: (
    nextToken?: string
  ) => Promise<{ items: any[]; next?: string; error?: string }>;
  saveFavoritesCSV: (payload: {
    path: string;
    results: any[];
  }) => Promise<{ status: string; path: string; error?: string }>;
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
