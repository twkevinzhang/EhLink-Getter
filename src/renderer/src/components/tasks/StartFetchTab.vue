<script setup lang="ts">
import { ref, watch } from "vue";
import { CaretRight } from "@element-plus/icons-vue";
import { useScraperStore } from "../../stores/scraper";
import { useConfigStore } from "../../stores/config";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";

const scraperStore = useScraperStore();
const configStore = useConfigStore();

const pageLink = ref("https://e-hentai.org/favorites.php");
const fromPage = ref(1);
const toPage = ref("All");

const handleStartFetch = async () => {
  if (!pageLink.value) {
    ElMessage.warning("Please enter a page or search link");
    return;
  }

  // Parse max pages from toPage
  let maxPages = Infinity;
  if (toPage.value !== "All" && toPage.value !== "") {
    const parsed = parseInt(toPage.value.toString());
    if (!isNaN(parsed) && parsed > 0) {
      maxPages = parsed;
    }
  }

  try {
    await scraperStore.startFetching(pageLink.value, maxPages);
    ElMessage.success("Fetching task started");
  } catch (err: any) {
    ElMessage.error(`Failed to start fetching: ${err.message}`);
  }
};
</script>

<template>
  <div class="p-4 flex flex-col gap-6">
    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Page / Search Link</div>
      <div class="p-4">
        <el-input v-model="pageLink" placeholder="https://e-hentai.org/..." />
      </div>
    </div>

    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Fetch Settings</div>
      <div class="p-4 flex flex-col gap-5">
        <div class="flex gap-8 items-center">
          <span class="text-xs text-eh-muted font-bold uppercase">Range:</span>
          <div class="flex items-center gap-2">
            <span class="text-xs">From:</span>
            <el-input v-model="fromPage" size="small" class="w-16" />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs">To:</span>
            <el-input v-model="toPage" size="small" class="w-16" />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 pt-4 border-t border-eh-border">
      <el-button
        type="primary"
        class="w-full !rounded-none !h-10 font-bold uppercase tracking-widest flex items-center justify-center gap-2"
        @click="handleStartFetch"
      >
        <el-icon><CaretRight /></el-icon>
        Start Fetching List
      </el-button>
    </div>
  </div>
</template>

<style scoped>
/* Scoped styles */
</style>
