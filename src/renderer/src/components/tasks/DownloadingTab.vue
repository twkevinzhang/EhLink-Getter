<script setup lang="ts">
import { useDownloadStore } from '@renderer/stores/download'
import type { JobState } from '@renderer/stores/download'
import { storeToRefs } from 'pinia'
import { useToast } from 'primevue/usetoast'

const downloadStore = useDownloadStore()
const { downloadingJobs } = storeToRefs(downloadStore)
const toast = useToast()

const handlePauseAll = () => {
  downloadingJobs.value.forEach((job) => downloadStore.pauseJob(job.jobId))
  toast.add({
    severity: 'info',
    summary: 'Paused',
    detail: 'All downloads paused',
    life: 3000,
  })
}

const handleStartAll = () => {
  downloadingJobs.value.forEach((job) => {
    if (job.mode === 'pending' || job.mode === 'paused') {
      downloadStore.startJob(job.jobId)
    }
  })
  toast.add({
    severity: 'success',
    summary: 'Started',
    detail: 'Started all pending/paused downloads',
    life: 3000,
  })
}

const handleClear = () => {
  downloadStore.clearFinishedJobs()
  toast.add({
    severity: 'success',
    summary: 'Cleared',
    detail: 'Cleared finished/error jobs',
    life: 3000,
  })
}

const toggleJob = (job: JobState) => {
  job.isExpanded = !job.isExpanded
}

const handlePauseJob = (jobId: string) => {
  downloadStore.pauseJob(jobId)
}

const handleResumeJob = (jobId: string) => {
  downloadStore.startJob(jobId)
}

const handleRestartJob = (jobId: string) => {
  downloadStore.restartJob(jobId)
}

const handleTerminateJob = (jobId: string) => {
  downloadStore.stopJob(jobId)
}

const handleRemoveJob = (jobId: string) => {
  downloadStore.removeJob(jobId)
}
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full overflow-hidden">
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header flex justify-between items-center">
        <span>Active Downloads</span>
        <div class="flex gap-2">
          <Button
            label="Start All"
            icon="pi pi-play"
            size="small"
            @click="handleStartAll"
          />
          <Button
            label="Pause All"
            icon="pi pi-pause"
            severity="secondary"
            size="small"
            outlined
            @click="handlePauseAll"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-eh-panel/30">
        <div
          v-for="job in downloadingJobs"
          :key="job.jobId"
          class="eh-panel-card bg-white/50 border border-eh-border/30 rounded-lg overflow-hidden flex flex-col transition-all"
        >
          <!-- Job Header -->
          <div
            class="flex items-center gap-3 p-3 bg-eh-bg/40 cursor-pointer hover:bg-eh-bg/60 transition-colors"
            @click="toggleJob(job)"
          >
            <i
              :class="[
                'pi',
                job.isExpanded ? 'pi-chevron-down' : 'pi-chevron-right',
                'text-eh-text text-[12px]',
              ]"
            ></i>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-4">
                <span class="text-sm font-bold text-eh-text truncate">{{
                  job.title
                }}</span>
                <div class="flex items-center gap-3">
                  <div
                    class="text-[10px] px-2 py-0.5 rounded border font-bold uppercase"
                    :class="{
                      'text-green-500 border-green-500': job.mode === 'completed',
                      'text-red-500 border-red-500': job.mode === 'error',
                      'text-eh-accent border-eh-accent': job.mode === 'running',
                      'text-gray-400 border-gray-400':
                        job.mode === 'paused' || job.mode === 'pending',
                      'text-orange-500 border-orange-500': job.mode === 'stopped',
                    }"
                  >
                    {{ job.mode }}
                  </div>
                  <div class="w-32 flex flex-col items-end gap-1">
                    <ProgressBar :value="job.progress" class="!h-2 w-full">
                      <template #default><span></span></template>
                    </ProgressBar>
                  </div>
                </div>
              </div>
            </div>

            <!-- Job Actions: 暫停/恢復 | 停止/重試 | 移除 -->
            <div class="flex gap-1">
              <!-- 暫停/恢復 -->
              <Button
                v-tooltip="job.mode === 'running' ? '暫停' : '恢復'"
                :icon="job.mode === 'running' ? 'pi pi-pause' : 'pi pi-play'"
                :disabled="
                  job.mode === 'error' ||
                  job.mode === 'completed' ||
                  job.mode === 'stopped'
                "
                rounded
                text
                size="small"
                @click.stop="
                  job.mode === 'running'
                    ? handlePauseJob(job.jobId)
                    : handleResumeJob(job.jobId)
                "
              />
              <!-- 停止/重試 -->
              <Button
                v-tooltip="
                  job.mode === 'error' ||
                  job.mode === 'completed' ||
                  job.mode === 'stopped'
                    ? '重試'
                    : '停止'
                "
                :icon="
                  job.mode === 'error' ||
                  job.mode === 'completed' ||
                  job.mode === 'stopped'
                    ? 'pi pi-refresh'
                    : 'pi pi-stop'
                "
                :disabled="job.mode === 'pending'"
                rounded
                text
                size="small"
                @click.stop="
                  job.mode === 'error' ||
                  job.mode === 'completed' ||
                  job.mode === 'stopped'
                    ? handleRestartJob(job.jobId)
                    : handleTerminateJob(job.jobId)
                "
              />
              <!-- 移除 -->
              <Button
                v-tooltip="'移除'"
                icon="pi pi-trash"
                :disabled="job.mode === 'running' || job.mode === 'paused'"
                rounded
                text
                size="small"
                @click.stop="handleRemoveJob(job.jobId)"
              />
            </div>
          </div>

          <!-- Gallery List (Collapsible) -->
          <div
            v-show="job.isExpanded"
            class="overflow-x-auto border-t border-eh-border/20"
          >
            <table class="w-full text-left border-collapse min-w-[800px]">
              <thead class="bg-eh-bg/10 text-[11px] text-eh-muted uppercase">
                <tr>
                  <th class="p-2 w-10 text-center">Type</th>
                  <th class="p-2 min-w-[200px]">Gallery Title</th>
                  <th class="p-2">Path</th>
                  <th class="p-2 w-20 text-center">Images</th>
                  <th class="p-2 w-32">Status</th>
                  <th class="p-2 w-20"></th>
                </tr>
              </thead>
              <tbody class="text-xs">
                <tr
                  v-for="gal in job.galleries"
                  :key="gal.gid"
                  class="border-t border-eh-border/10 hover:bg-white/40 transition-colors group"
                >
                  <td class="p-2 text-center text-eh-text">
                    <i
                      :class="[
                        'pi',
                        gal.isArchive ? 'pi-file-pdf' : 'pi-folder',
                        'text-[14px]',
                      ]"
                    ></i>
                  </td>
                  <td class="p-2">
                    <div class="truncate max-w-[300px]" :title="gal.title">
                      {{ gal.title }}
                    </div>
                  </td>
                  <td class="p-2 font-mono text-[9px] text-eh-muted">
                    <div class="truncate max-w-[250px]" :title="gal.targetPath">
                      {{ gal.targetPath }}
                    </div>
                  </td>
                  <td class="p-2 text-center">{{ gal.imagecount }}</td>
                  <td class="p-2">
                    <div class="flex flex-col gap-1">
                      <div
                        class="flex justify-between items-center text-[9px] whitespace-nowrap"
                      >
                        <span class="truncate pr-2">{{ gal.status }}</span>
                        <span class="font-bold">{{ gal.progress }}%</span>
                      </div>
                      <ProgressBar :value="gal.progress" class="!h-1">
                        <template #default><span></span></template>
                      </ProgressBar>
                    </div>
                  </td>
                  <td class="p-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          v-if="downloadingJobs.length === 0"
          class="text-center py-10 text-eh-muted text-xs italic"
        >
          No active downloads
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <Button
        label="Clear Finished"
        icon="pi pi-trash"
        severity="danger"
        outlined
        class="flex-1 !rounded-none !h-10 font-bold uppercase tracking-widest"
        @click="handleClear"
      />
    </div>
  </div>
</template>

<style scoped>
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.p-button-text:disabled),
:deep(.p-button-text.p-disabled) {
  color: #d1d5db !important;
  opacity: 1 !important;
}
</style>
