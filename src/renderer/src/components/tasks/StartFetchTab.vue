<script setup lang="ts">
import { ref, watch } from "vue";
import { CaretRight } from "@element-plus/icons-vue";
import { useAppStore } from "../../stores/app";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";

const store = useAppStore();
const { config } = storeToRefs(store);
const tasksPath = ref(config.value.tasks_path);

const pageLink = ref("https://e-hentai.org/favorites.php");
const fromPage = ref(1);
const toPage = ref("All");

const handleTasksPathBrowse = async () => {
  const path = await window.api.selectDirectory();
  if (path) {
    tasksPath.value = path + "/tasks.json";
    // loadExistingTasks will be triggered by watch
  }
};

watch(
  tasksPath,
  (newPath) => {
    if (newPath) {
      store.loadExistingTasks(newPath, pageLink.value);
    }
  },
  { immediate: true },
);

const handleStartFetch = async () => {
  if (!pageLink.value) {
    ElMessage.warning("Please enter a page or search link");
    return;
  }

  if (typeof store.startFetching !== "function") {
    console.error("store.startFetching is not a function!", store);
    ElMessage.error(
      "Store action 'startFetching' is missing. Please restart the app.",
    );
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
    await store.startFetching(pageLink.value, tasksPath.value, maxPages);
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
        <div class="flex flex-col gap-2 pt-2 border-t border-eh-bg">
          <label class="text-xs text-eh-muted font-bold uppercase"
            >Tasks Json Path:</label
          >
          <div class="flex gap-2">
            <el-input
              v-model="tasksPath"
              class="flex-1"
              placeholder="Path to tasks.json"
            />
            <el-button small @click="handleTasksPathBrowse">Browse</el-button>
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
