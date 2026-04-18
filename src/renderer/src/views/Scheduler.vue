<script setup lang="ts">
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { useSchedulerStore } from '../stores/scheduler'
import { useConfigStore } from '../stores/config'
import { useToast } from 'primevue/usetoast'
import SettingsTab from '../components/tasks/SettingsTab.vue'
import { onMounted, computed, ref } from 'vue'

const activeTab = ref('settings')
const schedulerStore = useSchedulerStore()
const configStore = useConfigStore()
const toast = useToast()

// Add Task Form
const pageLink = ref('https://e-hentai.org/?f_cats=767')
const fromPage = ref(1)
const toPage = ref<string | number>(2)
const scheduleTime = ref<Date | null>(new Date())
const customPath = ref('')
const useZip = ref(true)
const zipPass = ref('')

const displayPath = computed({
  get: () => {
    if (configStore.config.storage_strategy === 'eh_id') {
      return 'output/{ID}'
    }
    return customPath.value
  },
  set: (val) => {
    customPath.value = val
  }
})

const handleSelectPath = async () => {
  const path = await window.api.selectDirectory()
  if (path) {
    customPath.value = path
  }
}

const handlePlaceholder = (placeholder: string) => {
  customPath.value = (customPath.value || '') + placeholder
}

const handleAddTask = () => {
  if (!pageLink.value || !scheduleTime.value) {
    toast.add({
      severity: 'warn',
      summary: 'Missing Info',
      detail: 'Please fill in Link and Schedule Time',
      life: 3000
    })
    return
  }

  const timeStr = scheduleTime.value.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

  schedulerStore.addTask({
    link: pageLink.value,
    fromPage: fromPage.value,
    toPage: toPage.value,
    scheduleTime: timeStr,
    customDownloadPath: configStore.config.storage_strategy === 'traditional' ? customPath.value : '',
    isArchive: useZip.value,
    archivePassword: zipPass.value
  })

  toast.add({
    severity: 'success',
    summary: 'Task Added',
    detail: `Scheduled for ${timeStr}`,
    life: 3000
  })
  
  activeTab.value = 'task-list'
}

onMounted(async () => {
  if (!customPath.value) {
    const defaultPath = await window.api.getDownloadsPath()
    if (defaultPath) {
      customPath.value = defaultPath + '/{EN_TITLE}'
    }
  }
})

const formatStatus = (status: string) => {
  switch (status) {
    case 'enabled': return 'success'
    case 'disabled': return 'secondary'
    case 'running': return 'info'
    default: return 'contrast'
  }
}

const handleTriggerNow = async (taskId: string) => {
  try {
    const result = await window.api.triggerSchedulerTask(taskId)
    if (result.success) {
      toast.add({
        severity: 'info',
        summary: 'Task Triggered',
        detail: 'The task has been started manually.',
        life: 3000
      })
    } else {
      throw new Error(result.error)
    }
  } catch (err: any) {
    toast.add({
      severity: 'error',
      summary: 'Trigger Failed',
      detail: err.message,
      life: 5000
    })
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <Tabs v-model:value="activeTab" class="flex-1 flex flex-col">
      <TabList class="eh-tab-list" :pt="{
        tabList: { class: '!flex !flex-row !flex-nowrap' },
        content: { class: '!overflow-x-auto !overflow-y-hidden' }
      }">
        <Tab value="settings" class="eh-tab-item">Settings</Tab>
        <Tab value="add-task" class="eh-tab-item">Add Task</Tab>
        <Tab value="task-list" class="eh-tab-item">Task List</Tab>
      </TabList>

      <TabPanels class="flex-1 overflow-y-auto !bg-transparent !p-0">
        <!-- Settings Tab -->
        <TabPanel value="settings">
          <SettingsTab />
        </TabPanel>

        <!-- Add Task Tab -->
        <TabPanel value="add-task">
          <div class="p-4 flex flex-col gap-6">
            <div class="eh-panel-card overflow-hidden">
              <div class="eh-header">Page / Search Link</div>
              <div class="p-4">
                <InputText
                  v-model="pageLink"
                  placeholder="https://e-hentai.org/..."
                  class="w-full !p-2"
                />
              </div>
            </div>

            <div class="eh-panel-card overflow-hidden">
              <div class="eh-header">Schedule Settings</div>
              <div class="p-4 flex flex-col gap-5">
                <div class="flex gap-8 items-center flex-wrap">
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-eh-muted font-bold uppercase">From:</span>
                    <InputText v-model="fromPage" size="small" class="!w-16 !p-1 text-center" />
                    <span class="text-xs text-eh-muted font-bold uppercase ml-2">To:</span>
                    <InputText v-model="toPage" size="small" class="!w-16 !p-1 text-center" />
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-eh-muted font-bold uppercase">Time:</span>
                    <DatePicker v-model="scheduleTime" timeOnly hourFormat="24" class="h-8 !w-32" inputClass="!p-1 text-center" />
                  </div>
                </div>
              </div>
            </div>

            <div class="eh-panel-card overflow-hidden">
              <div class="eh-header">Download Configuration</div>
              <div class="p-4 flex flex-col gap-4 text-xs">
                <!-- Path Selection -->
                <div class="flex flex-col gap-2">
                  <label class="text-[10px] text-eh-muted font-bold uppercase flex items-center justify-between">
                    Target Path:
                    <Tag 
                      v-if="configStore.config.storage_strategy === 'eh_id'" 
                      value="EH_ID Strategy Lock" 
                      severity="secondary" 
                      class="!text-[8px]" 
                    />
                  </label>
                  <div class="flex gap-2">
                    <InputText 
                      v-model="displayPath" 
                      :disabled="configStore.config.storage_strategy === 'eh_id'"
                      size="small" 
                      class="flex-1 !p-1.5 !text-xs" 
                    />
                    <Button 
                      label="Browse" 
                      :disabled="configStore.config.storage_strategy === 'eh_id'"
                      size="small"
                      outlined
                      class="!py-1 !px-3"
                      @click="handleSelectPath" 
                    />
                  </div>
                  <div class="flex gap-2 mt-1">
                    <Button
                      v-for="p in ['{EN_TITLE}', '{ID}', '{JP_TITLE}']"
                      :key="p"
                      :label="p"
                      :disabled="configStore.config.storage_strategy === 'eh_id'"
                      size="small"
                      text
                      class="!text-[10px] !p-1 !bg-eh-panel/20"
                      @click="handlePlaceholder(p)"
                    />
                  </div>
                </div>

                <!-- Archive Settings -->
                <div class="flex items-center gap-6 mt-2">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-eh-muted font-bold uppercase">Archive</span>
                    <ToggleSwitch v-model="useZip" />
                  </div>
                  <div v-if="useZip" class="flex items-center gap-2 flex-1">
                    <span class="text-[10px] text-eh-muted font-bold uppercase">password:</span>
                    <InputText
                      v-model="zipPass"
                      size="small"
                      placeholder="Optional"
                      class="flex-1 !p-1.5 !text-xs"
                    />
                  </div>
                </div>

                <p class="text-[9px] text-eh-muted italic mt-1 border-t border-eh-border/30 pt-2">
                  * Note: custom paths are only applied when using <b>Traditional</b> storage strategy.
                </p>
              </div>
            </div>

            <div class="mt-4 pt-4 border-t border-eh-border">
              <Button
                label="Create Scheduler Task"
                icon="pi pi-check"
                class="w-full !bg-eh-border !border-eh-border !rounded-none !h-10 font-bold uppercase tracking-widest"
                @click="handleAddTask"
              />
            </div>
          </div>
        </TabPanel>

        <!-- Task List Tab -->
        <TabPanel value="task-list">
          <div class="p-4 flex flex-col gap-3">
            <div v-if="schedulerStore.tasks.length === 0" class="text-center py-20 text-eh-muted italic">
              No scheduled tasks yet.
            </div>
            <div 
              v-for="task in schedulerStore.sortedTasks" 
              :key="task.id" 
              class="eh-panel-card p-4 flex items-center justify-between gap-4"
            >
              <div class="flex-1 flex flex-col gap-2 overflow-hidden">
                <div class="flex items-center gap-3">
                  <span class="font-mono text-xl font-bold text-eh-accent">{{ task.scheduleTime }}</span>
                  <Tag :value="task.status.toUpperCase()" :severity="formatStatus(task.status)" class="!text-[9px]" />
                  <Tag v-if="task.isArchive" value="ZIP" severity="info" class="!text-[8px] !h-4" />
                </div>
                <div class="text-[11px] text-eh-muted truncate opacity-80">{{ task.link }}</div>
                
                <div v-if="task.customDownloadPath" class="flex items-center gap-1.5 opacity-70">
                  <i class="pi pi-folder text-[10px] text-eh-accent"></i>
                  <span class="text-[10px] text-eh-accent truncate font-mono">{{ task.customDownloadPath }}</span>
                </div>

                <div class="flex items-center gap-6 mt-1">
                  <div class="flex items-center gap-1.5">
                    <i class="pi pi-sync text-[10px] text-eh-muted"></i>
                    <span class="text-[10px] text-eh-muted uppercase font-bold">Runs:</span>
                    <span class="text-[11px] font-bold text-eh-text">{{ task.executionCount }}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <i class="pi pi-download text-[10px] text-eh-muted"></i>
                    <span class="text-[10px] text-eh-muted uppercase font-bold">Downloaded:</span>
                    <span class="text-[11px] font-bold text-eh-text">{{ task.downloadedCount }}</span>
                  </div>
                  <div class="flex items-center gap-1.5 ml-auto">
                    <span class="text-[10px] text-eh-muted uppercase">Range:</span>
                    <span class="text-[10px] font-medium text-eh-text">{{ task.fromPage }} → {{ task.toPage }}</span>
                  </div>
                </div>
                
                <div v-if="task.lastRun" class="text-[9px] text-eh-muted italic opacity-60">
                  Last run: {{ task.lastRun }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Button 
                  :icon="task.status === 'enabled' ? 'pi pi-pause' : 'pi pi-play'" 
                  text 
                  rounded 
                  size="small"
                   :severity="task.status === 'enabled' ? 'warn' : 'success'"
                   @click="schedulerStore.toggleTask(task.id)"
                 />
                 <Button 
                   icon="pi pi-bolt" 
                   text 
                   rounded 
                   size="small"
                   severity="info"
                   v-tooltip="'Trigger Now'"
                   :loading="task.status === 'running'"
                   @click="handleTriggerNow(task.id)"
                 />
                 <Button 
                   icon="pi pi-trash" 
                  text 
                  rounded 
                  size="small"
                  severity="danger"
                  @click="schedulerStore.removeTask(task.id)"
                />
              </div>
            </div>
          </div>
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

:deep(.p-tablist-tab-list) {
  @apply !flex !flex-row !flex-nowrap !bg-transparent !border-none;
}

:deep(.p-tablist-content) {
  @apply !bg-transparent !border-none;
}

:deep(.p-tablist-active-bar) {
  @apply !hidden;
}
</style>
