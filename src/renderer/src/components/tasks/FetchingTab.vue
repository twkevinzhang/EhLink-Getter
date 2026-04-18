<script setup lang="ts">
import { useFetchStore } from '../../stores/fetch'
import { storeToRefs } from 'pinia'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

const scraperStore = useFetchStore()
const { activeFetchingJobs } = storeToRefs(scraperStore)
const toast = useToast()
const confirm = useConfirm()

const handlePause = async (jobId: string) => {
  await scraperStore.pauseFetching(jobId)
  toast.add({ severity: 'success', summary: 'Paused', detail: 'Task paused', life: 3000 })
}

const handleResume = async (jobId: string) => {
  await scraperStore.resumeFetching(jobId)
  toast.add({
    severity: 'success',
    summary: 'Resumed',
    detail: 'Task resumed',
    life: 3000,
  })
}

const handleDelete = async (jobId: string) => {
  confirm.require({
    message: 'Are you sure you want to delete this task?',
    header: 'Delete Confirmation',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Delete',
    rejectLabel: 'Cancel',
    acceptClass: 'p-button-danger',
    accept: () => {
      scraperStore.deleteFetchingJob(jobId)
      toast.add({
        severity: 'success',
        summary: 'Deleted',
        detail: 'Task deleted',
        life: 3000,
      })
    },
  })
}

const getStateLabel = (state: string) => {
  switch (state) {
    case 'waiting':
      return '等待中'
    case 'fetching':
      return '爬取中'
    case 'paused':
      return '已暫停'
    default:
      return state
  }
}

const getStateColor = (state: string) => {
  switch (state) {
    case 'waiting':
      return 'bg-gray-200 text-gray-600'
    case 'fetching':
      return 'bg-blue-100 text-blue-700'
    case 'paused':
      return 'bg-orange-100 text-orange-700'
    default:
      return 'bg-gray-100 text-gray-500'
  }
}
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full">
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header">Active Scraper Jobs</div>
      <div class="p-4 flex-1 overflow-y-auto flex flex-col gap-3 bg-eh-panel/30">
        <div
          v-for="job in activeFetchingJobs"
          :key="job.id"
          class="eh-panel-card p-3 !bg-white/40"
        >
          <div class="flex flex-col gap-2">
            <!-- Header with state badge -->
            <div class="flex items-center justify-between">
              <div class="text-[11px] text-eh-muted truncate font-mono flex-1">
                {{ job.link }}
              </div>
              <span
                :class="[
                  'text-[10px] font-bold px-2 py-0.5 rounded',
                  getStateColor(job.state),
                ]"
              >
                {{ getStateLabel(job.state) }}
              </span>
            </div>

            <!-- Progress bar and status -->
            <div class="flex flex-col gap-1">
              <ProgressBar :value="job.progress" class="!h-2">
                <template #default>
                  <span></span>
                </template>
              </ProgressBar>
              <div
                class="flex justify-between items-center text-[10px] font-bold text-eh-text"
              >
                <span>PROGRESS</span>
                <span>{{ job.status }}</span>
              </div>
            </div>

            <!-- Stats -->
            <div class="flex gap-4 text-[10px] text-eh-muted">
              <span>頁數: {{ job.currentPage }}</span>
              <span>項目: {{ job.totalItems }}</span>
            </div>

            <!-- Action buttons -->
            <div class="flex gap-2 mt-2">
              <Button
                v-if="job.state === 'fetching'"
                label="暫停"
                icon="pi pi-pause"
                severity="warn"
                size="small"
                class="flex-1 !text-[12px]"
                @click="handlePause(job.id)"
              />
              <Button
                v-if="job.state === 'paused'"
                label="恢復"
                icon="pi pi-play"
                size="small"
                class="flex-1 !bg-eh-border !border-eh-border !text-[12px]"
                @click="handleResume(job.id)"
              />
              <Button
                :disabled="job.state === 'fetching'"
                label="刪除"
                icon="pi pi-trash"
                severity="danger"
                size="small"
                outlined
                class="flex-1 !text-[12px]"
                @click="handleDelete(job.id)"
              />
            </div>
          </div>
        </div>
        <div
          v-if="activeFetchingJobs.length === 0"
          class="text-center py-10 text-eh-muted text-xs italic"
        >
          No active scraping jobs
        </div>
      </div>
    </div>
  </div>
</template>
