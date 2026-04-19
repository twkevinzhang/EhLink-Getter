// src/renderer/src/stores/logs.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LogLevel, LogEntry } from '@shared/types/log'

export type { LogLevel, LogEntry }

export const useLogStore = defineStore('logs', () => {
  const logs = ref<LogEntry[]>([])

  function addLog(log: Omit<LogEntry, 'timestamp'>) {
    logs.value.unshift({
      ...log,
      timestamp: new Date().toLocaleTimeString(),
    })
    if (logs.value.length > 500) logs.value.pop()
  }

  return { logs, addLog }
})
