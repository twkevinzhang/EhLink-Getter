<script setup lang="ts">
import { useAppStore } from "../../stores/app";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";

const store = useAppStore();
const { downloadingJobs } = storeToRefs(store);

const handlePauseAll = () => {
  store.cancelFetching(""); // Reusing stop generic for now
  ElMessage.info("Pause command sent");
};

const handleClear = () => {
  const countBefore = downloadingJobs.value.length;
  store.clearFinishedJobs();
  const countAfter = downloadingJobs.value.length;
  ElMessage.success(`Cleared ${countBefore - countAfter} jobs`);
};
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full">
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header">Active Downloads</div>
      <div
        class="p-4 flex-1 overflow-y-auto flex flex-col gap-3 bg-eh-panel/30"
      >
        <div
          v-for="dl in downloadingJobs"
          :key="dl.id"
          class="eh-panel-card p-4 !bg-white/40"
        >
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-bold text-eh-text truncate">{{
                dl.title
              }}</span>
              <div
                class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-sm border"
                :class="
                  dl.mode === 'running'
                    ? 'bg-eh-cat-gamecg text-white border-eh-cat-gamecg'
                    : 'bg-gray-400 text-white border-gray-400'
                "
              >
                {{ dl.mode }}
              </div>
            </div>
            <el-progress :percentage="dl.progress" :stroke-width="12" />
            <div
              class="text-[11px] text-eh-muted font-mono bg-eh-bg/50 px-2 py-1 rounded-sm border border-eh-border/30"
            >
              {{ dl.status }}
            </div>
          </div>
        </div>
        <div
          v-if="downloadingJobs.length === 0"
          class="text-center py-10 text-eh-muted text-xs italic"
        >
          No active downloads
        </div>
      </div>
    </div>
    <div class="flex gap-2">
      <el-button
        plain
        class="flex-1 !rounded-none !h-10 font-bold uppercase tracking-widest border-eh-border text-eh-text"
        @click="handlePauseAll"
        >Pause All</el-button
      >
      <el-button
        plain
        class="flex-1 !rounded-none !h-10 font-bold uppercase tracking-widest border-eh-border text-eh-text"
        >Resume All</el-button
      >
      <el-button
        danger
        plain
        class="flex-1 !rounded-none !h-10 font-bold uppercase tracking-widest"
        @click="handleClear"
        >Clear Finished</el-button
      >
    </div>
  </div>
</template>

<style scoped>
/* Scoped styles */
</style>
