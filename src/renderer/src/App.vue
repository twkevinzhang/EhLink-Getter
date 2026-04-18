<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useLogStore } from './stores/logs'
import { useConfigStore } from './stores/config'
import { useSchedulerStore } from './stores/scheduler'
import TaskManager from './views/TaskManager.vue'
import Library from './views/Library.vue'
import Scheduler from './views/Scheduler.vue'
import SystemLogs from './components/SystemLogs.vue'
import type { SidecarLogEvent } from './types/api'
import type { ScheduledTask } from './stores/scheduler'

const logStore = useLogStore()
const configStore = useConfigStore()
const schedulerStore = useSchedulerStore()
const activeTab = ref('task-manager')

const navItems = [
  { key: 'task-manager', icon: 'pi-desktop', label: 'Task Manager' },
  { key: 'library', icon: 'pi-search', label: 'Library' },
  { key: 'scheduler', icon: 'pi-calendar-clock', label: 'Scheduler' },
  { key: 'system-logs', icon: 'pi-database', label: 'System Logs' },
]

onMounted(() => {
  window.api.onLog((log: SidecarLogEvent) => {
    logStore.addLog(log)
  })

  window.electron.ipcRenderer.on(
    'scheduler-updated',
    (_event, tasks: ScheduledTask[]) => {
      schedulerStore.syncFromMain(tasks)
    },
  )
})
</script>

<template>
  <Toast />
  <ConfirmDialog />
  <div class="h-screen w-screen flex flex-col bg-eh-bg text-eh-muted overflow-hidden p-2">
    <div
      class="flex-1 flex border border-eh-border rounded-sm overflow-hidden bg-eh-bg shadow-[0_0_10px_rgba(0,0,0,0.1)]"
    >
      <aside class="w-[200px] bg-eh-sidebar border-r border-eh-border flex flex-col">
        <div
          class="p-4 border-b border-eh-border bg-eh-panel flex flex-col items-center gap-1"
        >
          <div class="text-[10px] uppercase tracking-widest text-eh-text font-bold">
            E-Hentai
          </div>
          <div
            class="font-serif italic text-eh-text text-xl border-y border-eh-border px-2 py-1 my-1"
          >
            Link Getter
          </div>
        </div>

        <nav class="flex-1 pt-4 flex flex-col gap-1 px-2">
          <button
            v-for="item in navItems"
            :key="item.key"
            class="flex items-center gap-3 p-3 rounded-sm transition-all text-sm font-medium"
            :class="
              activeTab === item.key
                ? 'bg-eh-border text-white shadow-sm'
                : 'text-eh-text hover:bg-eh-panel/50'
            "
            @click="activeTab = item.key"
          >
            <i :class="`pi ${item.icon}`"></i>
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="p-4 border-t border-eh-border bg-eh-panel">
          <div class="flex items-center gap-2 text-[0.7rem] text-eh-text font-bold">
            <div
              class="w-1.5 h-1.5 rounded-full"
              :class="{
                'bg-green-500 animate-pulse shadow-[0_0_5px_#22c55e]':
                  configStore.sidecarOnline,
                'bg-red-500 shadow-[0_0_5px_#ef4444]': !configStore.sidecarOnline,
              }"
            ></div>
            <span> SIDECAR: {{ configStore.sidecarOnline ? 'ONLINE' : 'OFFLINE' }} </span>
          </div>
        </div>
      </aside>

      <main class="p-6 flex-1 relative bg-eh-bg overflow-y-auto">
        <TaskManager v-show="activeTab === 'task-manager'" />
        <Library v-show="activeTab === 'library'" />
        <Scheduler v-show="activeTab === 'scheduler'" />
        <SystemLogs v-show="activeTab === 'system-logs'" />
      </main>
    </div>
  </div>
</template>

<style>
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  @apply bg-eh-panel rounded-full hover:bg-primary;
}

.p-inputtext {
  @apply !bg-eh-bg !border-eh-border !text-eh-text !rounded-sm;
}

.p-button {
  @apply !rounded-sm;
}
</style>
