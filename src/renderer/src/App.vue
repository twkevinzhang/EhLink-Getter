<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAppStore } from "./stores/app";
import { ElMessage } from "element-plus";
import {
  Monitor,
  Setting,
  Document,
  Search,
  Connection,
} from "@element-plus/icons-vue";

import TaskConsole from "./components/TaskConsole.vue";
import MappingMetadata from "./components/MappingMetadata.vue";
import SearchMetadata from "./components/SearchMetadata.vue";
import SystemLogs from "./components/SystemLogs.vue";
import Configuration from "./components/Configuration.vue";

const store = useAppStore();
const activeTab = ref("dashboard");

onMounted(() => {
  // Listen to sidecar events
  window.api.onLog((log: any) => {
    store.addLog(log);
  });

  window.api.onProgress((data: any) => {
    store.updateProgress(data);
  });

  window.api.onTaskComplete((data: any) => {
    store.setTaskComplete(data);
    ElMessage.success(`Task completed: ${data.count} items found`);
  });
});
</script>

<template>
  <div class="h-screen w-screen flex bg-bg-dark text-text-main overflow-hidden">
    <el-container class="h-full">
      <!-- Sidebar -->
      <el-aside
        width="240px"
        class="bg-bg-sidebar border-r border-glass-border flex flex-col"
      >
        <div class="p-7 px-6 flex items-center gap-3">
          <div
            class="w-8 h-8 bg-gradient-to-br from-primary to-purple-500 rounded-lg flex items-center justify-center font-bold text-white"
          >
            Eh
          </div>
          <span class="text-xl font-bold tracking-tight">Link Getter</span>
        </div>

        <el-menu
          :default-active="activeTab"
          class="!bg-transparent !border-r-0 flex-1"
          @select="(key: string) => (activeTab = key)"
        >
          <el-menu-item
            index="dashboard"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg !text-text-muted hover:!bg-glass-bg [&.is-active]:!bg-glass-bg [&.is-active]:!text-primary"
          >
            <el-icon><Monitor /></el-icon>
            <span>Task Console</span>
          </el-menu-item>
          <el-menu-item
            index="mapping"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg !text-text-muted hover:!bg-glass-bg [&.is-active]:!bg-glass-bg [&.is-active]:!text-primary"
          >
            <el-icon><Connection /></el-icon>
            <span>Mapping Metadata</span>
          </el-menu-item>
          <el-menu-item
            index="search"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg !text-text-muted hover:!bg-glass-bg [&.is-active]:!bg-glass-bg [&.is-active]:!text-primary"
          >
            <el-icon><Search /></el-icon>
            <span>Search Metadata</span>
          </el-menu-item>
          <el-menu-item
            index="logs"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg !text-text-muted hover:!bg-glass-bg [&.is-active]:!bg-glass-bg [&.is-active]:!text-primary"
          >
            <el-icon><Document /></el-icon>
            <span>System Logs</span>
          </el-menu-item>
          <el-menu-item
            index="settings"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg !text-text-muted hover:!bg-glass-bg [&.is-active]:!bg-glass-bg [&.is-active]:!text-primary"
          >
            <el-icon><Setting /></el-icon>
            <span>Configuration</span>
          </el-menu-item>
        </el-menu>

        <div class="p-5 border-t border-glass-border">
          <div
            class="flex items-center gap-2 text-[0.8rem] text-text-muted"
            :class="store.task.status"
          >
            <div
              class="w-2 h-2 rounded-full"
              :class="
                store.task.status === 'running'
                  ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6] animate-pulse-custom'
                  : 'bg-emerald-500 shadow-[0_0_10px_#10b981]'
              "
            ></div>
            <span>Sidecar: Online</span>
          </div>
        </div>
      </el-aside>

      <!-- Main Content -->
      <el-main
        class="p-10 flex-1 relative bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.05),transparent_400px),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.05),transparent_400px)]"
      >
        <TaskConsole v-if="activeTab === 'dashboard'" />
        <MappingMetadata v-if="activeTab === 'mapping'" />
        <SearchMetadata v-if="activeTab === 'search'" />
        <SystemLogs v-if="activeTab === 'logs'" />
        <Configuration v-if="activeTab === 'settings'" />
      </el-main>
    </el-container>
  </div>
</template>

<style>
/* 
  Global Element Plus overrides that are easier to keep here 
  or in assets/tailwind.css. We'll keep some deep specificity fixers.
*/

.el-input__wrapper {
  @apply !bg-white/5 !shadow-none !border !border-glass-border !text-white;
}

.el-textarea__inner {
  @apply !bg-white/5 !shadow-none !border !border-glass-border !text-white;
}

.el-card__header {
  @apply !border-b-glass-border;
}

.el-select .el-input__wrapper {
  @apply !bg-white/5;
}

.el-tag {
  @apply !bg-indigo-500/20 !border-indigo-500/30 !text-indigo-300;
}

/* Custom scrollbar for webkit */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  @apply bg-white/10 rounded-full hover:bg-white/20;
}
</style>
