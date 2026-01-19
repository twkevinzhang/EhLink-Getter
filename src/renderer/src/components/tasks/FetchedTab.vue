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
  <div class="p-4 flex flex-col gap-6 h-full overflow-hidden">
    <!-- Tasks List Panel -->
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header">Fetched Tasks (Ready to Download)</div>
      <div class="p-4 flex-1 overflow-y-auto bg-white/30">
        <div
          v-for="task in fetchedTasks"
          :key="task.id"
          class="mb-4 eh-panel-card p-3 !bg-eh-panel/50"
        >
          <div class="text-sm font-bold flex items-center gap-2 text-eh-text">
            <el-icon><Folder /></el-icon>
            {{ task.title }} ({{ task.galleryCount }} Galleries)
          </div>
          <div class="ml-6 flex flex-col gap-1 mt-2">
            <div
              v-for="g in task.galleries"
              :key="g.id"
              class="text-[11px] text-eh-muted border-l-2 border-eh-border pl-2 py-0.5"
            >
              {{ g.title }}
            </div>
          </div>
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
            <el-button small>Browse</el-button>
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
        >Add All to Download Queue</el-button
      >
    </div>
  </div>
</template>

<style scoped>
/* Scoped styles */
</style>
