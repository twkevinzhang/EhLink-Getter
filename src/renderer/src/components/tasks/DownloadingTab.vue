<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useDownloadStore, type DownloadQueueItem } from '@renderer/stores/download'

const props = withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })

const downloadStore = useDownloadStore()
const { queueItems, activeItems, finishedItems, loading, error, pendingActions } =
  storeToRefs(downloadStore)
const toast = useToast()
const confirm = useConfirm()
const actionsMenu = ref()

const globalProgress = computed(() => {
  if (!queueItems.value.length) return 0
  return Math.round(
    queueItems.value.reduce((sum, item) => sum + item.progress, 0) /
      queueItems.value.length,
  )
})

const canStartAll = computed(
  () =>
    !props.disabled &&
    queueItems.value.some((item) => ['pending', 'paused'].includes(item.mode)),
)
const canPauseAll = computed(
  () => !props.disabled && queueItems.value.some((item) => item.mode === 'running'),
)
const canStopAll = computed(() => !props.disabled && activeItems.value.length > 0)

const globalActionItems = computed(() => [
  {
    label: '全部暫停',
    icon: 'pi pi-pause',
    disabled: !canPauseAll.value,
    command: () => perform(downloadStore.pauseAll, '執行中的下載已暫停'),
  },
  {
    label: '全部停止',
    icon: 'pi pi-stop',
    class: 'text-red-600',
    disabled: !canStopAll.value,
    command: () => confirmStopAll(),
  },
  { separator: true },
  {
    label: '清除已結束',
    icon: 'pi pi-trash',
    class: 'text-red-600',
    disabled: props.disabled || !finishedItems.value.length,
    command: () =>
      perform(downloadStore.clearFinishedItems, '已清除完成、停止與錯誤項目'),
  },
])

function statusLabel(mode: DownloadQueueItem['mode']) {
  return {
    pending: '等待中',
    running: '下載中',
    paused: '已暫停',
    completed: '已完成',
    error: '錯誤',
    stopped: '已停止',
  }[mode]
}

function statusSeverity(mode: DownloadQueueItem['mode']) {
  if (mode === 'completed') return 'success'
  if (mode === 'error') return 'danger'
  if (mode === 'running') return 'info'
  if (mode === 'paused' || mode === 'pending') return 'warn'
  return 'secondary'
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

function toggleGlobalActions(event: Event) {
  actionsMenu.value?.toggle(event)
}

function confirmStopAll() {
  confirm.require({
    header: '停止全部下載？',
    message:
      '所有等待中、下載中與已暫停的 Gallery 都會停止。未完成項目會保留，可稍後逐筆重試。',
    rejectLabel: '取消',
    acceptLabel: '全部停止',
    acceptProps: { severity: 'danger' },
    accept: () => perform(downloadStore.stopAll, '所有未完成下載已停止'),
  })
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
          <span>進行中 {{ activeItems.length }}</span>
          <span>已結束 {{ finishedItems.length }}</span>
          <span>總計 {{ queueItems.length }}</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button
          label="全部開始"
          icon="pi pi-play"
          size="small"
          :disabled="!canStartAll"
          :loading="Boolean(pendingActions['global:start'])"
          @click="perform(downloadStore.startAll, '已啟動可繼續的下載項目')"
        />
        <Button
          v-tooltip="'更多全域操作'"
          icon="pi pi-ellipsis-h"
          aria-label="更多全域操作"
          size="small"
          text
          :disabled="disabled"
          @click="toggleGlobalActions"
        />
        <Menu ref="actionsMenu" :model="globalActionItems" popup />
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
        <span><i class="pi pi-spin pi-spinner mr-2"></i>載入下載項目…</span>
      </div>

      <article
        v-for="item in queueItems"
        v-else
        :key="item.queueItemId"
        class="rounded-md border border-eh-border/30 bg-eh-panel p-3 shadow-sm"
      >
        <div
          class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,18rem)_auto] sm:items-center"
        >
          <div class="min-w-0">
            <div class="flex items-start gap-3">
              <span
                class="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded bg-eh-sidebar"
              >
                <i
                  class="text-xs text-eh-text"
                  :class="item.isArchive ? 'pi pi-file' : 'pi pi-folder'"
                ></i>
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <strong
                    class="min-w-0 truncate text-sm text-eh-text"
                    :title="item.title"
                  >
                    {{ item.title }}
                  </strong>
                  <Tag
                    :value="statusLabel(item.mode)"
                    :severity="statusSeverity(item.mode)"
                  />
                </div>
                <p
                  class="mt-1 truncate font-mono text-[9px] text-eh-muted"
                  :title="item.targetPath"
                >
                  {{ item.targetPath || '尚未建立路徑' }}
                </p>
              </div>
            </div>
          </div>

          <div class="min-w-0">
            <div class="mb-1 flex justify-between gap-2 text-[10px] text-eh-muted">
              <span class="truncate" :title="item.status">{{
                item.status || '等待更新'
              }}</span>
              <span class="shrink-0 tabular-nums">
                {{ item.progress }}% · {{ item.imagecount }} 張
              </span>
            </div>
            <ProgressBar :value="item.progress" class="!h-1.5">
              <template #default><span></span></template>
            </ProgressBar>
          </div>

          <div class="flex shrink-0 justify-end gap-1">
            <Button
              v-tooltip="item.mode === 'running' ? '暫停' : '繼續'"
              :icon="item.mode === 'running' ? 'pi pi-pause' : 'pi pi-play'"
              rounded
              text
              size="small"
              :loading="
                downloadStore.isActionPending(
                  item.queueItemId,
                  item.mode === 'running' ? 'pause' : 'start',
                )
              "
              :disabled="
                disabled ||
                downloadStore.isActionPending(item.queueItemId) ||
                ['error', 'completed', 'stopped'].includes(item.mode)
              "
              @click="
                perform(() =>
                  item.mode === 'running'
                    ? downloadStore.pauseItem(item.queueItemId)
                    : downloadStore.startItem(item.queueItemId),
                )
              "
            />
            <Button
              v-tooltip="
                ['error', 'completed', 'stopped'].includes(item.mode) ? '重試' : '停止'
              "
              :icon="
                ['error', 'completed', 'stopped'].includes(item.mode)
                  ? 'pi pi-refresh'
                  : 'pi pi-stop'
              "
              rounded
              text
              size="small"
              :loading="downloadStore.isActionPending(item.queueItemId)"
              :disabled="disabled || downloadStore.isActionPending(item.queueItemId)"
              @click="
                perform(() =>
                  ['error', 'completed', 'stopped'].includes(item.mode)
                    ? downloadStore.restartItem(item.queueItemId)
                    : downloadStore.stopItem(item.queueItemId),
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
              :loading="downloadStore.isActionPending(item.queueItemId, 'remove')"
              :disabled="
                disabled ||
                downloadStore.isActionPending(item.queueItemId) ||
                ['running', 'paused'].includes(item.mode)
              "
              @click="perform(() => downloadStore.removeItem(item.queueItemId))"
            />
          </div>
        </div>
      </article>

      <div
        v-if="!loading && !queueItems.length"
        class="grid min-h-52 place-items-center rounded-md border border-dashed border-eh-border/40 bg-eh-panel/40 px-6 text-center"
      >
        <div>
          <i class="pi pi-download mb-3 text-3xl text-eh-border/60"></i>
          <p class="font-medium text-eh-text">目前沒有下載項目</p>
          <p class="mt-1 text-xs text-eh-muted">手動新增 Gallery，或等待排程建立項目。</p>
        </div>
      </div>
    </div>
  </section>
</template>
