import { defineStore } from "pinia";
import { ref } from "vue";

export interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
}

export const useLogStore = defineStore("logs", () => {
  const logs = ref<LogEntry[]>([]);

  function addLog(log: any) {
    const entry = {
      ...log,
      timestamp: new Date().toLocaleTimeString(),
    };
    logs.value.unshift(entry);
    if (logs.value.length > 500) logs.value.pop();
  }

  return {
    logs,
    addLog,
  };
});
