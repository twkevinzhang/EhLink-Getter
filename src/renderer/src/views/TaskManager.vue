<script setup lang="ts">
import { ref } from 'vue'
import SettingsTab from '../components/tasks/SettingsTab.vue'
import StartFetchTab from '../components/tasks/StartFetchTab.vue'
import FetchingTab from '../components/tasks/FetchingTab.vue'
import FetchedTab from '../components/tasks/FetchedTab.vue'
import DownloadingTab from '../components/tasks/DownloadingTab.vue'
import { useFetchStore } from '../stores/fetch'
import { useDownloadStore } from '../stores/download'

const activeTab = ref('settings')
const fetchStore = useFetchStore()
const downloadStore = useDownloadStore()
</script>

<template>
  <div class="h-full flex flex-col overflow-y-auto">
    <el-tabs v-model="activeTab" class="eh-tabs">
      <el-tab-pane label="Settings" name="settings">
        <SettingsTab />
      </el-tab-pane>
      <el-tab-pane label="Start Fetch" name="start-fetch">
        <StartFetchTab />
      </el-tab-pane>

      <el-tab-pane name="fetching">
        <template #label>
          <div class="flex items-center gap-1.5">
            <span>Fetching</span>
            <el-badge
              v-if="fetchStore.activeFetchingJobs.length > 0"
              :value="fetchStore.activeFetchingJobs.length"
              type="primary"
              class="eh-tab-badge"
            />
          </div>
        </template>
        <FetchingTab />
      </el-tab-pane>

      <el-tab-pane name="fetched">
        <template #label>
          <div class="flex items-center gap-1.5">
            <span>Fetched</span>
            <el-badge
              v-if="fetchStore.galleries.length > 0"
              :value="fetchStore.galleries.length"
              type="success"
              class="eh-tab-badge"
            />
          </div>
        </template>
        <FetchedTab />
      </el-tab-pane>

      <el-tab-pane name="downloading">
        <template #label>
          <div class="flex items-center gap-1.5">
            <span>Downloading</span>
            <el-badge
              v-if="downloadStore.downloadingJobs.length > 0"
              :value="downloadStore.downloadingJobs.length"
              type="warning"
              class="eh-tab-badge"
            />
          </div>
        </template>
        <DownloadingTab />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.eh-tabs :deep(.el-tabs__nav-wrap::after) {
  @apply bg-eh-border;
}

.eh-tab-badge :deep(.el-badge__content) {
  @apply !border-none !scale-75 !h-4 !min-w-[16px] !px-1;
}
</style>
