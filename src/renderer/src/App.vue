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

import TaskManager from "./views/TaskManager.vue";
import Library from "./views/Library.vue";

const store = useAppStore();
const activeTab = ref("task-manager");

onMounted(() => {
  // Listen to sidecar events
  window.api.onLog((log: any) => {
    store.addLog(log);
  });
});
</script>

<template>
  <div
    class="h-screen w-screen flex flex-col bg-eh-bg text-eh-muted overflow-hidden p-2"
  >
    <!-- Main Decorative Border Container -->
    <div
      class="flex-1 flex border border-eh-border rounded-sm overflow-hidden bg-eh-bg shadow-[0_0_10px_rgba(0,0,0,0.1)]"
    >
      <el-container class="h-full">
        <!-- Sidebar -->
        <el-aside
          width="200px"
          class="bg-eh-sidebar border-r border-eh-border flex flex-col"
        >
          <!-- logo / title area -->
          <div
            class="p-4 border-b border-eh-border bg-eh-panel flex flex-col items-center gap-1"
          >
            <div
              class="text-[10px] uppercase tracking-widest text-eh-text font-bold"
            >
              E-Hentai
            </div>
            <div
              class="font-serif italic text-eh-text text-xl border-y border-eh-border px-2 py-1 my-1"
            >
              Link Getter
            </div>
          </div>

          <el-menu
            :default-active="activeTab"
            class="!bg-transparent !border-r-0 flex-1 pt-4"
            @select="(key: string) => (activeTab = key)"
          >
            <el-menu-item index="task-manager" class="eh-menu-item">
              <el-icon><Monitor /></el-icon>
              <span>Task Manager</span>
            </el-menu-item>
            <el-menu-item index="library" class="eh-menu-item">
              <el-icon><Search /></el-icon>
              <span>Library</span>
            </el-menu-item>
          </el-menu>

          <div class="p-4 border-t border-eh-border bg-eh-panel">
            <div
              class="flex items-center gap-2 text-[0.7rem] text-eh-text font-bold"
            >
              <div
                class="w-1.5 h-1.5 rounded-full bg-eh-accent shadow-[0_0_5px_#f11d1d] animate-pulse"
              ></div>
              <span>SIDECAR: ONLINE</span>
            </div>
          </div>
        </el-aside>

        <!-- Main Content -->
        <el-main class="p-6 flex-1 relative bg-eh-bg overflow-y-auto">
          <TaskManager v-if="activeTab === 'task-manager'" />
          <Library v-if="activeTab === 'library'" />
        </el-main>
      </el-container>
    </div>
  </div>
</template>

<style>
/* 
  Global Element Plus overrides that are easier to keep here 
  or in assets/tailwind.css. We'll keep some deep specificity fixers.
*/

.el-input__wrapper {
  @apply !bg-eh-bg !shadow-none !border !border-eh-border !text-eh-text;
}

.el-textarea__inner {
  @apply !bg-eh-bg !shadow-none !border !border-eh-border !text-eh-text;
}

.el-card__header {
  @apply !border-b-eh-border;
}

.el-select .el-input__wrapper {
  @apply !bg-eh-bg;
}

.el-tag {
  @apply !bg-eh-border !border-eh-border !text-eh-accent;
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
  @apply bg-eh-panel rounded-full hover:bg-eh-accent;
}
</style>
