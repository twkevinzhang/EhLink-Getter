<script setup lang="ts">
import { ref } from "vue";

const activeDownloads = ref([
  {
    id: 1,
    title: "[Artist] Manga Name",
    progress: 40,
    status: "Downloading: 01.jpg",
    mode: "running",
  },
  {
    id: 2,
    title: "[Cosplay] Title",
    progress: 0,
    status: "Paused",
    mode: "paused",
  },
]);
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full">
    <div class="font-bold mb-2">Active Downloads</div>
    <div class="flex-1 overflow-y-auto flex flex-col gap-4">
      <el-card v-for="dl in activeDownloads" :key="dl.id" class="dl-card">
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold truncate">{{ dl.title }}</span>
            <el-tag
              size="small"
              :type="dl.mode === 'running' ? 'primary' : 'info'"
              >{{ dl.mode }}</el-tag
            >
          </div>
          <el-progress :percentage="dl.progress" />
          <div class="text-xs text-eh-muted">{{ dl.status }}</div>
        </div>
      </el-card>
    </div>
    <div class="mt-4 flex gap-2">
      <el-button primary plain>Pause All</el-button>
      <el-button primary plain>Resume All</el-button>
      <el-button danger plain>Clear Failed</el-button>
    </div>
  </div>
</template>

<style scoped>
.dl-card {
  @apply !bg-eh-bg/50 border-eh-border;
}
</style>
