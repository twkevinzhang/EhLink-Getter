<script setup lang="ts">
import { ref } from "vue";
import SettingsTab from "../components/tasks/SettingsTab.vue";
import StartFetchTab from "../components/tasks/StartFetchTab.vue";
import FetchingTab from "../components/tasks/FetchingTab.vue";
import FetchedTab from "../components/tasks/FetchedTab.vue";
import DownloadingTab from "../components/tasks/DownloadingTab.vue";
import CompletedTab from "../components/tasks/CompletedTab.vue";

const activeTab = ref("settings");
</script>

<template>
  <div class="task-manager-view h-full flex flex-col">
    <el-tabs v-model="activeTab" class="eh-tabs">
      <el-tab-pane label="Settings" name="settings">
        <SettingsTab />
      </el-tab-pane>
      <el-tab-pane label="Start Fetch" name="start-fetch">
        <StartFetchTab />
      </el-tab-pane>
      <el-tab-pane label="Fetching" name="fetching">
        <FetchingTab />
      </el-tab-pane>
      <el-tab-pane label="Fetched" name="fetched">
        <FetchedTab />
      </el-tab-pane>
      <el-tab-pane label="Downloading" name="downloading">
        <DownloadingTab />
      </el-tab-pane>
      <el-tab-pane label="Completed" name="completed">
        <CompletedTab />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.eh-tabs :deep(.el-tabs__nav-wrap::after) {
  @apply bg-eh-border;
}
</style>
