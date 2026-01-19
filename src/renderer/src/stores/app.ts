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

export const useAppStore = defineStore("app", () => {
  // State
  const     logs = ref<LogEntry[]>([]);
  const     config = reactive({
      cookies: "",
      proxies: [] as string[],
tasks_path: "tasks.json",
      metadata_path: "metadata.json",
      download_path: "output",
      scan_thread_cnt: 3,
      download_thread_cnt: 5,
      storage_strategy: "logical" as "logical" | "traditional",
    });
  const fetchingJobs = ref<ScraperJob[]>([]);
  const fetchedTasks = ref<any[]>([]);
  const downloadingJobs = ref<DownloadJob[]>([]);
  const completedTasks = ref<any[]>([]);
  const libraryGalleries = ref<any[]>([]);

  // Actions
  function addLog(log: any) {
    const entry = {
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
