<script setup lang="ts">
import { ref } from "vue";
import { Folder } from "@element-plus/icons-vue";

const fetchedTasks = ref([
  {
    id: 1,
    title: "[GuiGu] Collection",
    galleryCount: 5,
    galleries: [
      { id: 101, title: "[GuiGu] Comic 1" },
      { id: 102, title: "[GuiGu] Comic 2" },
    ],
  },
]);

const targetPath = ref("C:/DL/[EN_TITLE]");
const useZip = ref(true);
const zipPass = ref("pass");
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full">
    <div class="section flex-1 flex flex-col min-h-0">
      <div class="font-bold mb-2">Fetched Tasks (Ready to Download)</div>
      <div
        class="flex-1 overflow-y-auto border border-eh-border p-2 bg-eh-bg/30"
      >
        <div v-for="task in fetchedTasks" :key="task.id" class="mb-4">
          <div class="text-sm font-bold flex items-center gap-2">
            <el-icon><Folder /></el-icon>
            {{ task.title }} ({{ task.galleryCount }} Galleries)
          </div>
          <div class="ml-6 flex flex-col gap-1 mt-1">
            <div
              v-for="g in task.galleries"
              :key="g.id"
              class="text-xs text-eh-muted"
            >
              {{ g.title }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="font-bold mb-2">Download Configuration (Global)</div>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-eh-muted"
            >Target Path & Placeholders:</label
          >
          <div class="flex gap-2">
            <el-input v-model="targetPath" class="flex-1" />
            <el-button small>Browse</el-button>
          </div>
          <div class="flex gap-2 mt-1">
            <el-button size="small" plain>[EN_TITLE]</el-button>
            <el-button size="small" plain>[ID]</el-button>
            <el-button size="small" plain>[JP_TITLE]</el-button>
          </div>
        </div>
        <div class="flex items-center gap-6">
          <el-checkbox v-model="useZip">Archive (Zip)</el-checkbox>
          <div class="flex items-center gap-2 flex-1" v-if="useZip">
            <span class="text-xs text-eh-muted">Password:</span>
            <el-input v-model="zipPass" size="small" placeholder="Optional" />
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4">
      <el-button type="primary" class="w-full"
        >Add All to Download Queue</el-button
      >
    </div>
  </div>
</template>

<style scoped>
.section {
  @apply border-b border-eh-border pb-4;
}
</style>
