import { defineStore } from 'pinia'
import { useElectronStorage } from '@renderer/composables/electron-storage'
import { computed } from 'vue'
import type { ScheduledTask } from '@shared/types/api'

export const useSchedulerStore = defineStore('scheduler', () => {
  const tasks = useElectronStorage<ScheduledTask[]>('scheduler.tasks', [])

  const sortedTasks = computed(() =>
    [...tasks.value].sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime)),
  )

  function addTask(
    task: Omit<ScheduledTask, 'taskId' | 'status' | 'executionCount' | 'downloadedCount'>,
  ) {
    tasks.value.push({
      ...task,
      taskId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'enabled',
      executionCount: 0,
      downloadedCount: 0,
    })
  }

  function removeTask(taskId: string) {
    const idx = tasks.value.findIndex((t) => t.taskId === taskId)
    if (idx !== -1) tasks.value.splice(idx, 1)
  }

  function toggleTask(taskId: string) {
    const task = tasks.value.find((t) => t.taskId === taskId)
    if (task) {
      task.status = task.status === 'enabled' ? 'disabled' : 'enabled'
    }
  }

  /** main process 透過 scheduler-updated 事件推送完整 tasks 陣列時呼叫 */
  function syncFromMain(updatedTasks: ScheduledTask[]) {
    tasks.value = updatedTasks
  }

  return { tasks, sortedTasks, addTask, removeTask, toggleTask, syncFromMain }
})
