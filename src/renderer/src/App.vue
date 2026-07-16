<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useLogStore } from './stores/logs'
import { useConfigStore } from './stores/config'
import { useWorkspaceStore } from './stores/workspace'
import { useAutomationStore } from './stores/automation'
import TaskManager from './views/TaskManager.vue'
import Library from './views/Library.vue'
import Collections from './views/Collections.vue'
import Scheduler from './views/Scheduler.vue'
import SystemLogs from './views/SystemLogs.vue'
import SettingsTab from './components/tasks/SettingsTab.vue'
import WorkspaceGate from './components/shared/WorkspaceGate.vue'
import type { SidecarLogEvent } from '@shared/types/api'

type ViewKey =
  | 'task-manager'
  | 'library'
  | 'collections'
  | 'scheduler'
  | 'system-logs'
  | 'settings'

const logStore = useLogStore()
const configStore = useConfigStore()
const workspace = useWorkspaceStore()
const automation = useAutomationStore()
const activeTab = ref<ViewKey>('task-manager')

const navItems = [
  { key: 'task-manager' as const, icon: 'pi-desktop', label: '工作管理' },
  { key: 'library' as const, icon: 'pi-search', label: 'Library' },
  { key: 'collections' as const, icon: 'pi-folder', label: 'Collections' },
  { key: 'scheduler' as const, icon: 'pi-calendar-clock', label: '排程' },
  { key: 'system-logs' as const, icon: 'pi-database', label: 'System Logs' },
]

const workspaceViews = new Set<ViewKey>(['collections', 'scheduler'])
const workspaceBlocked = computed(
  () => workspaceViews.has(activeTab.value) && !workspace.configured,
)
const activeFeatureName = computed(
  () => navItems.find((item) => item.key === activeTab.value)?.label ?? '此功能',
)
const edgeToEdge = computed(() => ['collections', 'scheduler'].includes(activeTab.value))

onMounted(async () => {
  window.api.onLog((log: SidecarLogEvent) => {
    logStore.addLog(log)
  })
  await Promise.all([workspace.load(), configStore.load()])
  if (workspace.configured) await automation.load()
})

watch(
  () => workspace.path,
  async (nextPath, previousPath) => {
    if (!nextPath || nextPath === previousPath) return
    await Promise.all([automation.load(), configStore.load()])
  },
)
</script>

<template>
  <Toast position="bottom-right" />
  <ConfirmDialog />
  <div class="h-screen w-screen overflow-hidden bg-eh-bg p-2 text-eh-muted">
    <div
      class="flex h-full min-h-0 overflow-hidden rounded-md border border-eh-border bg-eh-bg shadow-[0_12px_40px_rgba(49,14,16,0.12)]"
    >
      <aside
        class="flex w-[210px] shrink-0 flex-col border-r border-eh-border bg-eh-sidebar"
      >
        <div
          class="flex h-[76px] items-center gap-3 border-b border-eh-border bg-eh-panel px-4"
        >
          <img src="./assets/app-logo.svg" alt="EhLink-Getter logo" class="h-11 w-11" />
          <div class="flex flex-col leading-none text-eh-text" aria-label="EhLink Getter">
            <span class="text-lg font-bold tracking-wide">EhLink</span>
            <span class="mt-1 font-serif text-sm italic tracking-wide">Getter</span>
          </div>
        </div>

        <nav class="flex flex-1 flex-col gap-1 px-2 py-4" aria-label="主要功能">
          <button
            v-for="item in navItems"
            :key="item.key"
            type="button"
            class="group flex items-center gap-3 rounded-md border px-3 py-3 text-left text-sm font-medium transition-all"
            :class="
              activeTab === item.key
                ? 'border-eh-border bg-eh-border text-white shadow-sm'
                : 'border-transparent text-eh-text hover:border-eh-border/20 hover:bg-eh-panel'
            "
            :aria-current="activeTab === item.key ? 'page' : undefined"
            @click="activeTab = item.key"
          >
            <i :class="`pi ${item.icon}`" class="w-4 text-center"></i>
            <span class="flex-1">{{ item.label }}</span>
            <i
              v-if="workspaceViews.has(item.key) && !workspace.configured"
              class="pi pi-lock text-[10px] opacity-60"
              aria-label="需要工作資料夾"
            ></i>
          </button>
        </nav>

        <div class="border-t border-eh-border bg-eh-panel p-3">
          <button
            type="button"
            class="mb-3 flex w-full items-center gap-2 rounded-md border border-eh-border/20 bg-eh-bg/60 p-2 text-left transition-colors hover:border-eh-border/50"
            title="開啟設定"
            @click="activeTab = 'settings'"
          >
            <span
              class="grid h-8 w-8 shrink-0 place-items-center rounded bg-eh-sidebar text-eh-text"
            >
              <i
                class="pi"
                :class="workspace.configured ? 'pi-folder' : 'pi-folder-open'"
              ></i>
            </span>
            <span class="min-w-0 flex-1">
              <span
                class="block text-[10px] font-bold uppercase tracking-wider text-eh-muted"
              >
                Workspace
              </span>
              <span class="block truncate text-xs font-medium text-eh-text">
                {{ workspace.configured ? workspace.folderName : '尚未設定' }}
              </span>
            </span>
            <i class="pi pi-cog text-xs text-eh-text"></i>
          </button>

          <div class="flex items-center gap-2 text-[0.67rem] font-bold text-eh-text">
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="
                configStore.sidecarOnline
                  ? 'animate-pulse bg-green-500 shadow-[0_0_5px_#22c55e]'
                  : 'bg-red-500 shadow-[0_0_5px_#ef4444]'
              "
            ></span>
            SIDECAR: {{ configStore.sidecarOnline ? 'ONLINE' : 'OFFLINE' }}
          </div>
        </div>
      </aside>

      <main
        class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-eh-bg"
        :class="edgeToEdge ? 'p-0' : 'p-6'"
      >
        <TaskManager v-if="activeTab === 'task-manager'" />
        <Library v-else-if="activeTab === 'library'" />
        <Collections v-else-if="activeTab === 'collections'" />
        <Scheduler v-else-if="activeTab === 'scheduler'" />
        <SystemLogs v-else-if="activeTab === 'system-logs'" />
        <SettingsTab v-else />

        <WorkspaceGate v-if="workspaceBlocked" :featureName="activeFeatureName" />
      </main>
    </div>
  </div>
</template>

<style>
::-webkit-scrollbar {
  width: 7px;
  height: 7px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  @apply rounded-full bg-eh-border/30 hover:bg-primary;
}

.p-inputtext,
.p-select,
.p-multiselect,
.p-inputnumber-input {
  @apply !rounded-md !border-eh-border/30 !bg-eh-bg !text-eh-text;
}

.p-button {
  @apply !rounded-md;
}

.p-dialog {
  @apply !border !border-eh-border/40 !bg-eh-panel !text-eh-muted;
}

.p-dialog-header,
.p-dialog-content {
  @apply !bg-eh-panel !text-eh-text;
}
</style>
