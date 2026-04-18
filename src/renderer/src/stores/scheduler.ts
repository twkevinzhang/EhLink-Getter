import { defineStore } from 'pinia'
import { useElectronStorage } from '@renderer/composables/electron-storage'
import { computed } from 'vue'

export interface ScheduledTask {
  taskId: string
  link: string
  fromPage: number
  toPage: number | string
  scheduleTime: string // Format: "HH:mm"
  templatePath?: string
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
    task: Omit<ScheduledTask, 'taskId' | 'status' | 'executionCount' | 'downloadedCount'>,
  ) {
    const newTask: ScheduledTask = {
      ...task,
      taskId: Date.now().toString(),
      status: 'enabled',
      executionCount: 0,
      downloadedCount: 0,
    }
    tasks.value.push(newTask)
  }

  function incrementExecution(taskId: string) {
    const task = tasks.value.find((t) => t.taskId === taskId)
    if (task) {
      task.executionCount++
      task.lastRun = new Date().toLocaleString()
    }
  }

  function incrementDownloaded(taskId: string, count: number = 1) {
    const task = tasks.value.find((t) => t.taskId === taskId)
    if (task) {
      task.downloadedCount += count
    }
  }

  function removeTask(taskId: string) {
    const idx = tasks.value.findIndex((t) => t.taskId === taskId)
    if (idx !== -1) {
      tasks.value.splice(idx, 1)
    }
  }

  function toggleTask(taskId: string) {
    const task = tasks.value.find((t) => t.taskId === taskId)
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
