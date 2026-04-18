<script setup lang="ts">
import { ref } from 'vue'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Badge from 'primevue/badge'

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
  <div class="h-full flex flex-col">
    <Tabs v-model:value="activeTab" class="flex-1 flex flex-col">
      <TabList
        class="eh-tab-list"
        :pt="{
          tabList: { class: '!flex !flex-row !flex-nowrap' },
          content: { class: '!overflow-x-auto !overflow-y-hidden' },
        }"
      >
        <Tab value="settings" class="eh-tab-item">Settings</Tab>
        <Tab value="start-fetch" class="eh-tab-item">Start Fetch</Tab>
        <Tab value="fetching" class="eh-tab-item">
          <div class="flex items-center gap-1.5 whitespace-nowrap">
            <span>Fetching</span>
            <Badge
              v-if="fetchStore.activeFetchingJobs.length > 0"
              :value="fetchStore.activeFetchingJobs.length"
              severity="secondary"
              class="eh-badge"
            />
          </div>
        </Tab>
        <Tab value="fetched" class="eh-tab-item">
          <div class="flex items-center gap-1.5 whitespace-nowrap">
            <span>Fetched</span>
            <Badge
              v-if="fetchStore.galleries.length > 0"
              :value="fetchStore.galleries.length"
              severity="success"
              class="eh-badge"
            />
          </div>
        </Tab>
        <Tab value="downloading" class="eh-tab-item">
          <div class="flex items-center gap-1.5 whitespace-nowrap">
            <span>Downloading</span>
            <Badge
              v-if="downloadStore.downloadingJobs.length > 0"
              :value="downloadStore.downloadingJobs.length"
              severity="warn"
              class="eh-badge"
            />
          </div>
        </Tab>
      </TabList>

      <TabPanels class="flex-1 overflow-y-auto !bg-transparent !p-0">
        <TabPanel value="settings">
          <SettingsTab />
        </TabPanel>
        <TabPanel value="start-fetch">
          <StartFetchTab />
        </TabPanel>
        <TabPanel value="fetching">
          <FetchingTab />
        </TabPanel>
        <TabPanel value="fetched">
          <FetchedTab />
        </TabPanel>
        <TabPanel value="downloading">
          <DownloadingTab />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>

<style scoped>
.eh-tab-list {
  @apply !bg-eh-sidebar border-b border-eh-border shrink-0;
}

.eh-tab-item {
  @apply !text-eh-text !p-4 !px-6 !font-bold transition-all border-b-2 border-transparent whitespace-nowrap !flex !items-center !justify-center;
  min-height: 52px;
}

.eh-tab-item[data-p-active='true'] {
  @apply !border-eh-border !bg-eh-panel/30 !text-eh-accent;
}

.eh-badge {
  @apply !text-[9px] !min-w-[1.2rem] !h-[1.2rem] !flex !items-center !justify-center !p-0;
}

/* Force override PrimeVue's internal list container */
:deep(.p-tablist-tab-list) {
  @apply !flex !flex-row !flex-nowrap !bg-transparent !border-none;
}

:deep(.p-tablist-content) {
  @apply !bg-transparent !border-none;
}

/* Hide the moving slider if it conflicts with our tab-item border */
:deep(.p-tablist-active-bar) {
  @apply !hidden;
}
</style>
