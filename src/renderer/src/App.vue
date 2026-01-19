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
  <div class="h-screen w-screen flex bg-eh-bg text-eh-text overflow-hidden">
    <el-container class="h-full">
      <!-- Sidebar -->
      <el-aside
        width="240px"
        class="bg-eh-sidebar border-r border-eh-border flex flex-col"
      >
        <div class="p-7 px-6 flex items-center gap-3">
          <div
            class="w-8 h-8 bg-eh-border rounded-lg flex items-center justify-center font-bold text-eh-text"
          >
            Eh
          </div>
          <span class="text-xl font-bold tracking-tight text-eh-text"
            >EhLink Getter</span
          >
        </div>

        <el-menu
          :default-active="activeTab"
          class="!bg-transparent !border-r-0 flex-1"
          @select="(key: string) => (activeTab = key)"
        >
          <el-menu-item
            index="task-manager"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg"
          >
            <el-icon><Monitor /></el-icon>
            <span>Task Manager</span>
          </el-menu-item>
          <el-menu-item
            index="library"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg"
          >
            <el-icon><Search /></el-icon>
            <span>Library</span>
          </el-menu-item>
        </el-menu>

        <div class="p-5 border-t border-eh-border">
          <div class="flex items-center gap-2 text-[0.8rem] text-eh-muted">
            <div
              class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"
            ></div>
            <span>Sidecar: Online</span>
          </div>
        </div>
      </el-aside>

      <!-- Main Content -->
      <el-main class="p-10 flex-1 relative bg-eh-bg">
        <TaskManager v-if="activeTab === 'task-manager'" />
        <Library v-if="activeTab === 'library'" />
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
