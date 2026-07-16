<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import { useDownloadStore, type JobState } from '@renderer/stores/download'

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })

const downloadStore = useDownloadStore()
const { downloadingJobs, activeJobs, finishedJobs, loading, error, pendingActions } =
  storeToRefs(downloadStore)
const toast = useToast()

const globalProgress = computed(() => {
  if (!downloadingJobs.value.length) return 0
  return Math.round(
    downloadingJobs.value.reduce((sum, job) => sum + job.progress, 0) /
      downloadingJobs.value.length,
  )
})

const canStartAll = computed(
  () =>
    !props.disabled &&
    downloadingJobs.value.some((job) => ['pending', 'paused'].includes(job.mode)),
)
const canPauseAll = computed(
  () => !props.disabled && downloadingJobs.value.some((job) => job.mode === 'running'),
)

function statusLabel(mode: JobState['mode']) {
  return {
    pending: '等待中',
    running: '下載中',
    paused: '已暫停',
    completed: '已完成',
    error: '錯誤',
    stopped: '已停止',
  }[mode]
}

function statusSeverity(mode: JobState['mode']) {
  if (mode === 'completed') return 'success'
  if (mode === 'error') return 'danger'
  if (mode === 'running') return 'info'
  if (mode === 'paused' || mode === 'pending') return 'warn'
  return 'secondary'
}

function toggleJob(job: JobState) {
  job.isExpanded = !job.isExpanded
}

async function perform(action: () => Promise<unknown>, success?: string) {
  try {
    await action()
    if (success) {
      toast.add({ severity: 'success', summary: '已更新', detail: success, life: 2600 })
    }
  } catch (reason) {
    toast.add({
      severity: 'error',
      summary: '操作失敗',
      detail: reason instanceof Error ? reason.message : String(reason),
      life: 5000,
    })
  }
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col gap-4" aria-label="全域下載進度">
    <div
      class="grid gap-3 rounded-md border border-eh-border/30 bg-eh-sidebar/70 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div class="min-w-0">
        <div class="mb-2 flex items-center justify-between gap-3 text-xs">
          <span class="font-bold text-eh-text">全域進度</span>
          <span class="tabular-nums text-eh-muted">{{ globalProgress }}%</span>
        </div>
        <ProgressBar :value="globalProgress" class="!h-2.5">
          <template #default><span></span></template>
        </ProgressBar>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-eh-muted">
          <span>進行中 {{ activeJobs.length }}</span>
          <span>已結束 {{ finishedJobs.length }}</span>
          <span>總計 {{ downloadingJobs.length }}</span>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 sm:justify-end">
        <Button
          label="全部開始"
          icon="pi pi-play"
          size="small"
          :disabled="!canStartAll"
          :loading="Boolean(pendingActions['global:start'])"
          @click="perform(downloadStore.startAll, '已啟動可繼續的下載工作')"
        />
        <Button
          label="全部暫停"
          icon="pi pi-pause"
          severity="secondary"
          size="small"
          outlined
          :disabled="!canPauseAll"
          @click="perform(downloadStore.pauseAll, '執行中的下載已暫停')"
        />
        <Button
          label="清除已結束"
          icon="pi pi-trash"
          severity="danger"
          size="small"
          text
          :disabled="disabled || !finishedJobs.length"
          :loading="Boolean(pendingActions['global:clear'])"
          @click="perform(downloadStore.clearFinishedJobs, '已清除完成、停止與錯誤工作')"
        />
      </div>
    </div>

    <div
      v-if="error"
      class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700"
      role="alert"
    >
      {{ error }}
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
      <div
        v-if="loading"
        class="grid min-h-40 place-items-center rounded-md border border-dashed border-eh-border/40 text-sm text-eh-muted"
      >
        <span><i class="pi pi-spin pi-spinner mr-2"></i>載入下載工作…</span>
      </div>

      <article
        v-for="job in downloadingJobs"
        v-else
        :key="job.jobId"
        class="overflow-hidden rounded-md border border-eh-border/30 bg-eh-panel shadow-sm"
      >
        <div class="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-start gap-3 text-left"
            :aria-expanded="Boolean(job.isExpanded)"
            @click="toggleJob(job)"
          >
            <span
              class="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded bg-eh-sidebar"
            >
              <i
                class="pi text-[11px] text-eh-text"
                :class="job.isExpanded ? 'pi-chevron-down' : 'pi-chevron-right'"
              ></i>
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <strong class="min-w-0 truncate text-sm text-eh-text">{{
                  job.title
                }}</strong>
                <Tag
                  :value="statusLabel(job.mode)"
                  :severity="statusSeverity(job.mode)"
                />
              </span>
              <span class="mt-1 block text-[11px] text-eh-muted">
                {{ job.galleries.length }} 本 Gallery · {{ job.status || '等待更新' }}
              </span>
            </span>
          </button>

          <div class="flex min-w-0 items-center gap-3 sm:w-[20rem]">
            <div class="min-w-24 flex-1">
              <div class="mb-1 text-right text-[10px] tabular-nums text-eh-muted">
                {{ job.progress }}%
              </div>
              <ProgressBar :value="job.progress" class="!h-1.5">
                <template #default><span></span></template>
              </ProgressBar>
            </div>
            <div class="flex shrink-0 gap-1">
              <Button
                v-tooltip="job.mode === 'running' ? '暫停' : '繼續'"
                :icon="job.mode === 'running' ? 'pi pi-pause' : 'pi pi-play'"
                rounded
                text
                size="small"
                :loading="
                  downloadStore.isActionPending(
                    job.jobId,
                    job.mode === 'running' ? 'pause' : 'start',
                  )
                "
                :disabled="
                  disabled ||
                  downloadStore.isActionPending(job.jobId) ||
                  ['error', 'completed', 'stopped'].includes(job.mode)
                "
                @click="
                  perform(() =>
                    job.mode === 'running'
                      ? downloadStore.pauseJob(job.jobId)
                      : downloadStore.startJob(job.jobId),
                  )
                "
              />
              <Button
                v-tooltip="
                  ['error', 'completed', 'stopped'].includes(job.mode) ? '重試' : '停止'
                "
                :icon="
                  ['error', 'completed', 'stopped'].includes(job.mode)
                    ? 'pi pi-refresh'
                    : 'pi pi-stop'
                "
                rounded
                text
                size="small"
                :loading="downloadStore.isActionPending(job.jobId)"
                :disabled="
                  disabled ||
                  downloadStore.isActionPending(job.jobId) ||
                  job.mode === 'pending'
                "
                @click="
                  perform(() =>
                    ['error', 'completed', 'stopped'].includes(job.mode)
                      ? downloadStore.restartJob(job.jobId)
                      : downloadStore.stopJob(job.jobId),
                  )
                "
              />
              <Button
                v-tooltip="'移除'"
                icon="pi pi-trash"
                severity="danger"
                rounded
                text
                size="small"
                :loading="downloadStore.isActionPending(job.jobId, 'remove')"
                :disabled="
                  disabled ||
                  downloadStore.isActionPending(job.jobId) ||
                  ['running', 'paused'].includes(job.mode)
                "
                @click="perform(() => downloadStore.removeJob(job.jobId))"
              />
            </div>
          </div>
        </div>

        <div v-show="job.isExpanded" class="border-t border-eh-border/20 bg-eh-bg/30">
          <div
            v-for="gallery in job.galleries"
            :key="gallery.gid"
            class="grid gap-2 border-b border-eh-border/10 p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,18rem)] sm:items-center"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <i :class="gallery.isArchive ? 'pi pi-file' : 'pi pi-folder'"></i>
                <span
                  class="truncate text-xs font-medium text-eh-text"
                  :title="gallery.title"
                >
                  {{ gallery.title }}
                </span>
              </div>
              <p
                class="mt-1 truncate font-mono text-[9px] text-eh-muted"
                :title="gallery.targetPath"
              >
                {{ gallery.targetPath || '尚未建立路徑' }}
              </p>
            </div>
            <div>
              <div class="mb-1 flex justify-between gap-2 text-[10px] text-eh-muted">
                <span class="truncate">{{ gallery.status }}</span>
                <span class="shrink-0 tabular-nums">
                  {{ gallery.progress }}% · {{ gallery.imagecount }} 張
                </span>
              </div>
              <ProgressBar :value="gallery.progress" class="!h-1">
                <template #default><span></span></template>
              </ProgressBar>
            </div>
          </div>
        </div>
      </article>

      <div
        v-if="!loading && !downloadingJobs.length"
        class="grid min-h-52 place-items-center rounded-md border border-dashed border-eh-border/40 bg-eh-panel/40 px-6 text-center"
      >
        <div>
          <i class="pi pi-download mb-3 text-3xl text-eh-border/60"></i>
          <p class="font-medium text-eh-text">目前沒有下載工作</p>
          <p class="mt-1 text-xs text-eh-muted">手動新增 Gallery，或等待排程建立工作。</p>
        </div>
      </div>
    </div>
  </section>
</template>
