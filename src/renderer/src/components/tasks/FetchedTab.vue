<script setup lang="ts">
import { ref, watch } from "vue";
import { Folder } from "@element-plus/icons-vue";
import { useAppStore } from "../../stores/app";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";

const store = useAppStore();
const { fetchedTasks, config } = storeToRefs(store);

const targetPath = ref(config.value.download_path);
const useZip = ref(true);
const zipPass = ref("");
const expandedTasks = ref<string[]>([]);

watch(targetPath, (val) => store.updateConfig({ download_path: val }));

const handleAddAllToQueue = async () => {
  if (fetchedTasks.value.length === 0) {
    ElMessage.warning("No tasks to download");
    return;
  }

  for (const task of fetchedTasks.value) {
    await store.startDownload(task.id, task.title, task.galleries);
  }

  ElMessage.success(
    `Added ${fetchedTasks.value.length} tasks to download queue`,
  );
  fetchedTasks.value = []; // Clear current list after adding to queue
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
                class="text-[11px] text-eh-muted border-l-2 border-eh-border pl-2 py-0.5"
              >
                {{ g.title }}
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
            <el-button small @click="() => {}">Browse</el-button>
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
