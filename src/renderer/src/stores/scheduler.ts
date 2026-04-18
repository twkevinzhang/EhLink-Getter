import { defineStore } from 'pinia'
import { useElectronStorage } from '@renderer/composables/electron-storage'
import { computed } from 'vue'

export interface ScheduledTask {
  id: string
  link: string
  fromPage: number
  toPage: number | string
  scheduleTime: string // Format: "HH:mm"
  customDownloadPath?: string
  isArchive?: boolean
  archivePassword?: string
  lastRun?: string
  status: 'enabled' | 'disabled' | 'running'
  executionCount: number
  downloadedCount: number
}

export const useSchedulerStore = defineStore('scheduler', () => {
  const tasks = useElectronStorage<ScheduledTask[]>('scheduler.tasks', [])

  const sortedTasks = computed(() => {
    return [...tasks.value].sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))
  })

  function addTask(
    task: Omit<ScheduledTask, 'id' | 'status' | 'executionCount' | 'downloadedCount'>,
  ) {
    const newTask: ScheduledTask = {
      ...task,
      id: Date.now().toString(),
      status: 'enabled',
      executionCount: 0,
      downloadedCount: 0,
    }
    tasks.value.push(newTask)
  }

  function incrementExecution(id: string) {
    const task = tasks.value.find((t) => t.id === id)
    if (task) {
      task.executionCount++
      task.lastRun = new Date().toLocaleString()
    }
  }

  function incrementDownloaded(id: string, count: number = 1) {
    const task = tasks.value.find((t) => t.id === id)
    if (task) {
      task.downloadedCount += count
    }
  }

  function removeTask(id: string) {
    const idx = tasks.value.findIndex((t) => t.id === id)
    if (idx !== -1) {
      tasks.value.splice(idx, 1)
    }
  }

  function toggleTask(id: string) {
    const task = tasks.value.find((t) => t.id === id)
    if (task) {
      task.status = task.status === 'enabled' ? 'disabled' : 'enabled'
    }
  }

  return {
    tasks,
    sortedTasks,
    addTask,
    removeTask,
    toggleTask,
  }
})
