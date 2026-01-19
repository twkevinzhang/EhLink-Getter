<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { Folder } from "@element-plus/icons-vue";
import { useAppStore } from "../../stores/app";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";

interface Gallery {
  id: string;
  title: string;
  link: string;
}

const store = useAppStore();
const { fetchedTasks, config } = storeToRefs(store);

const targetPath = ref(config.value.download_path);
const useZip = ref(true);
const zipPass = ref("");
const expandedTasks = ref<string[]>([]);

// Track selected galleries for each task
const selectedGalleries = ref<Record<string, Set<string>>>({});

// Initialize selected galleries when tasks change
watch(
  fetchedTasks,
  (tasks) => {
    tasks.forEach((task) => {
      if (!selectedGalleries.value[task.id]) {
        selectedGalleries.value[task.id] = new Set(
          task.galleries.map((g: Gallery) => g.id),
        );
      }
    });
  },
  { immediate: true, deep: true },
);

watch(targetPath, (val) => store.updateConfig({ download_path: val }));

// Check if a gallery is selected
const isGallerySelected = (taskId: string, galleryId: string) => {
  return selectedGalleries.value[taskId]?.has(galleryId) ?? false;
};

// Toggle gallery selection
const toggleGallery = (taskId: string, galleryId: string) => {
  if (!selectedGalleries.value[taskId]) {
    selectedGalleries.value[taskId] = new Set();
  }
  if (selectedGalleries.value[taskId].has(galleryId)) {
    selectedGalleries.value[taskId].delete(galleryId);
  } else {
    selectedGalleries.value[taskId].add(galleryId);
  }
};

// Browse for folder
const handleBrowse = async () => {
  try {
    const result = await window.api.selectDirectory();
    if (result) {
      targetPath.value = result;
    }
  } catch (error) {
    console.error("Failed to select folder:", error);
    ElMessage.error("Failed to select folder");
  }
};

const handleAddAllToQueue = async () => {
  if (fetchedTasks.value.length === 0) {
    ElMessage.warning("No tasks to download");
    return;
  }

  let totalAdded = 0;
  for (const task of fetchedTasks.value) {
    // Filter only selected galleries
    const selected = selectedGalleries.value[task.id];
    if (!selected || selected.size === 0) {
      continue;
    }
    const selectedGalleryList = task.galleries.filter((g: Gallery) =>
      selected.has(g.id),
    );
    if (selectedGalleryList.length > 0) {
      await store.startDownload(task.id, task.title, selectedGalleryList);
      totalAdded++;
    }
  }

  if (totalAdded === 0) {
    ElMessage.warning("No galleries selected for download");
    return;
  }

  ElMessage.success(`Added ${totalAdded} tasks to download queue`);
  fetchedTasks.value = []; // Clear current list after adding to queue
  selectedGalleries.value = {}; // Clear selections
};
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full overflow-hidden">
    <!-- Tasks List Panel -->
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header">Fetched Tasks (Ready to Download)</div>
      <div class="p-4 flex-1 overflow-y-auto bg-white/30">
        <el-collapse v-model="expandedTasks" class="fetched-tasks-collapse">
          <el-collapse-item
            v-for="task in fetchedTasks"
            :key="task.id"
            :name="task.id"
            class="mb-4"
          >
            <template #title>
              <div
                class="text-sm font-bold flex items-center gap-2 text-eh-text"
              >
                <el-icon><Folder /></el-icon>
                {{ task.title }} ({{ task.galleryCount }} Galleries)
              </div>
            </template>
            <div class="ml-6 flex flex-col gap-1 mt-2">
              <div
                v-for="g in task.galleries"
                :key="g.id"
                class="flex items-center gap-2 text-[11px] border-l-2 border-eh-border pl-2 py-0.5"
              >
                <el-checkbox
                  :model-value="isGallerySelected(task.id, g.id)"
                  @change="toggleGallery(task.id, g.id)"
                  size="small"
                />
                <span
                  :class="[
                    isGallerySelected(task.id, g.id)
                      ? 'text-eh-muted'
                      : 'text-gray-400 line-through',
                  ]"
                >
                  {{ g.title }}
                </span>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
        <div
          v-if="fetchedTasks.length === 0"
          class="text-center py-10 text-eh-muted text-xs italic"
        >
          No fetched tasks yet
        </div>
      </div>
    </div>

    <!-- Configuration Panel -->
    <div class="eh-panel-card overflow-hidden">
      <div class="eh-header">Download Configuration</div>
      <div class="p-4 flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label class="text-[10px] text-eh-muted font-bold uppercase"
            >Target Path & Placeholders:</label
          >
          <div class="flex gap-2">
            <el-input v-model="targetPath" class="flex-1" />
            <el-button small @click="handleBrowse">Browse</el-button>
          </div>
          <div class="flex gap-2 mt-1">
            <el-button size="small" plain class="!bg-eh-bg/50"
              >[EN_TITLE]</el-button
            >
            <el-button size="small" plain class="!bg-eh-bg/50">[ID]</el-button>
            <el-button size="small" plain class="!bg-eh-bg/50"
              >[JP_TITLE]</el-button
            >
          </div>
        </div>
        <div class="flex items-center gap-10 pt-2 border-t border-eh-bg">
          <el-checkbox v-model="useZip" class="!h-auto"
            ><span class="text-xs font-bold uppercase"
              >Archive (Zip)</span
            ></el-checkbox
          >
          <div class="flex items-center gap-2 flex-1" v-if="useZip">
            <span class="text-[11px] text-eh-muted font-bold uppercase"
              >Password:</span
            >
            <el-input v-model="zipPass" size="small" placeholder="Optional" />
          </div>
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <el-button
        type="primary"
        class="w-full !rounded-none !h-10 font-bold uppercase tracking-widest"
        @click="handleAddAllToQueue"
        >Add All to Download Queue</el-button
      >
    </div>
  </div>
</template>

<style scoped>
.fetched-tasks-collapse :deep(.el-collapse-item) {
  @apply eh-panel-card !bg-eh-panel/50 mb-3;
}

.fetched-tasks-collapse :deep(.el-collapse-item__header) {
  @apply !bg-transparent !border-b-0 px-3 py-2;
}

.fetched-tasks-collapse :deep(.el-collapse-item__wrap) {
  @apply !bg-transparent !border-b-0;
}

.fetched-tasks-collapse :deep(.el-collapse-item__content) {
  @apply pb-3 px-3;
}

.fetched-tasks-collapse :deep(.el-collapse-item__arrow) {
  @apply text-eh-accent;
}
</style>
