import { defineStore } from "pinia";

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
}

interface TaskInfo {
  status: "idle" | "running" | "completed" | "error";
  progress: number;
  message: string;
}

export const useAppStore = defineStore("app", {
  state: () => ({
    logs: [] as LogEntry[],
    config: {
      cookies: "",
      proxy: "",
      metadata_path: "metadata.json",
      download_path: "output",
    },
    task: {
      status: "idle",
      progress: 0,
      message: "Ready",
    } as TaskInfo,
    results: [] as any[],
  }),
  actions: {
    addLog(log: any) {
      this.logs.unshift({
        ...log,
        timestamp: new Date().toLocaleTimeString(),
      });
      if (this.logs.length > 500) this.logs.pop();
    },
    updateProgress(data: any) {
      this.task.status = "running";
      this.task.message = data.message;
      // Simulation of progress if the backend doesn't provide exact %
      this.task.progress = (this.task.progress + 5) % 100;
    },
    setTaskComplete(data: any) {
      this.task.status = "completed";
      this.task.progress = 100;
      this.task.message = `Completed! Found ${data.count} items.`;
      this.results = data.results;
    },
    setTaskError(msg: string) {
      this.task.status = "error";
      this.task.message = msg;
    },
  },
});
