<script setup lang="ts">
import { ref } from "vue";

const activeScrapers = ref([
  {
    id: 1,
    link: "https://e-hentai.org/?f_search=guigu",
    progress: 40,
    status: "Parsing Page 2/5",
  },
  {
    id: 2,
    link: "https://exhentai.org/?f_search=collection",
    progress: 100,
    status: "Finished",
  },
]);
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full">
    <div class="font-bold mb-2">Active Scraper Jobs</div>
    <div class="flex-1 overflow-y-auto flex flex-col gap-4">
      <el-card v-for="job in activeScrapers" :key="job.id" class="job-card">
        <div class="flex flex-col gap-2">
          <div class="text-xs text-eh-muted truncate">{{ job.link }}</div>
          <div class="flex items-center gap-4">
            <el-progress :percentage="job.progress" class="flex-1" />
            <span class="text-xs w-24 text-right">{{ job.status }}</span>
          </div>
        </div>
      </el-card>
    </div>
    <div class="mt-4 flex gap-2">
      <el-button type="danger" plain class="flex-1">Cancel Selected</el-button>
    </div>
  </div>
</template>

<style scoped>
.job-card {
  @apply !bg-eh-bg/50 border-eh-border;
}
</style>
