import { defineStore } from "pinia";

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
}

interface ScraperJob {
  id: string;
  link: string;
  progress: number;
  status: string;
}

interface DownloadJob {
  id: string;
  title: string;
  progress: number;
  status: string;
  mode: "running" | "paused" | "error";
}

export const useAppStore = defineStore("app", {
  state: () => ({
    logs: [] as LogEntry[],
    config: {
      cookies: "",
      proxies: [] as string[],
      metadata_path: "metadata.json",
      download_path: "output",
      scan_thread_cnt: 3,
      download_thread_cnt: 5,
      storage_strategy: "logical" as "logical" | "traditional",
    },
    fetchingJobs: [] as ScraperJob[],
    fetchedTasks: [] as any[], // Ready to download
    downloadingJobs: [] as DownloadJob[],
    completedTasks: [] as any[],
    libraryGalleries: [] as any[],
  }),
  actions: {
    addLog(log: any) {
      this.logs.unshift({
        ...log,
        timestamp: new Date().toLocaleTimeString(),
      });
      if (this.logs.length > 500) this.logs.pop();
    },
    updateConfig(newConfig: any) {
      this.config = { ...this.config, ...newConfig };
    },
    // More actions will be added during final integration
  },
});
