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
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header">Active Scraper Jobs</div>
      <div
        class="p-4 flex-1 overflow-y-auto flex flex-col gap-3 bg-eh-panel/30"
      >
        <div
          v-for="job in activeScrapers"
          :key="job.id"
          class="eh-panel-card p-3 !bg-white/40"
        >
          <div class="flex flex-col gap-2">
            <div class="text-[11px] text-eh-muted truncate font-mono">
              {{ job.link }}
            </div>
            <div class="flex items-center gap-4">
              <el-progress :percentage="job.progress" class="flex-1" />
              <span
                class="text-[11px] w-24 text-right font-bold text-eh-text"
                >{{ job.status }}</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="flex gap-2">
      <el-button
        type="danger"
        plain
        class="flex-1 !rounded-none !h-10 uppercase tracking-widest font-bold"
        >Cancel Selected</el-button
      >
    </div>
  </div>
</template>

<style scoped>
/* Scoped styles */
</style>
