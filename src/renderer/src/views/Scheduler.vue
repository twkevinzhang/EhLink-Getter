<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import MultiSelect from 'primevue/multiselect'
import ProgressBar from 'primevue/progressbar'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { storeToRefs } from 'pinia'
import {
  buildCronExpression,
  formatScheduleFrequency,
  INTERVAL_HOUR_OPTIONS,
  parseScheduleFrequency,
  type ScheduleFrequencyMode,
} from '@shared/schedule_frequency'
import { useDownloadStore } from '@renderer/stores/download'
import {
  useAutomationStore,
  type Schedule,
  type ScheduleRun,
  type ScheduleRunStatus,
} from '@renderer/stores/automation'
import { useWorkspaceStore } from '@renderer/stores/workspace'

const automation = useAutomationStore()
const workspace = useWorkspaceStore()
const downloadStore = useDownloadStore()
const confirm = useConfirm()
const toast = useToast()
const { schedules, runs, activeRuns } = storeToRefs(automation)

const selectedId = ref('')
const editorVisible = ref(false)
const editingId = ref<string>()
const saving = ref(false)
const editorError = ref('')
const downloadPauseActionId = ref('')

const form = reactive({
  name: '',
  monitorUrl: '',
  frequencyMode: 'interval' as ScheduleFrequencyMode,
  intervalHours: 6,
  time: '00:00',
  weekdays: [1] as number[],
  customCron: '0 */6 * * *',
  pageLimit: 3,
  targetCollectionId: null as string | null,
  enabled: true,
})

const frequencyModeOptions: Array<{
  label: string
  value: Exclude<ScheduleFrequencyMode, 'custom'>
}> = [
  { label: '每隔幾小時', value: 'interval' },
  { label: '每天', value: 'daily' },
  { label: '每週', value: 'weekly' },
]
const intervalOptions = INTERVAL_HOUR_OPTIONS.map((value) => ({
  label: `每 ${value} 小時`,
  value,
}))
const weekdayOptions = ['日', '一', '二', '三', '四', '五', '六'].map((day, value) => ({
  label: `週${day}`,
  value,
}))
const collectionOptions = computed(() => [
  { collectionId: null as string | null, name: '未分類' },
  ...automation.sortedCollections,
])

const selectedSchedule = computed(() =>
  schedules.value.find((schedule) => schedule.scheduleId === selectedId.value),
)
const selectedRun = computed(() =>
  selectedSchedule.value
    ? activeRuns.value[selectedSchedule.value.scheduleId]
    : undefined,
)
const selectedRuns = computed(() =>
  selectedSchedule.value
    ? runs.value
        .filter((run) => run.scheduleId === selectedSchedule.value?.scheduleId)
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    : [],
)
const selectedItems = computed(() =>
  selectedSchedule.value
    ? automation.itemsForSchedule(
        downloadStore.queueItems,
        selectedSchedule.value.scheduleId,
      )
    : [],
)
const targetCollectionName = computed(() => {
  const targetId = selectedSchedule.value?.targetCollectionId
  if (!targetId) return '未分類'
  return (
    automation.collections.find((collection) => collection.collectionId === targetId)
      ?.name ?? '未分類'
  )
})
const frequencySummary = computed(() => {
  try {
    return formatScheduleFrequency(
      buildCronExpression({
        mode: form.frequencyMode,
        intervalHours: form.intervalHours,
        time: form.time,
        weekdays: form.weekdays,
        customCron: form.customCron,
      }),
    )
  } catch {
    return '請完成執行頻率設定'
  }
})

watch(
  schedules,
  (value) => {
    if (!value.some((schedule) => schedule.scheduleId === selectedId.value)) {
      selectedId.value = value[0]?.scheduleId ?? ''
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (workspace.configured) void automation.load()
})

function openCreate() {
  editingId.value = undefined
  Object.assign(form, {
    name: '',
    monitorUrl: '',
    frequencyMode: 'interval',
    intervalHours: 6,
    time: '00:00',
    weekdays: [1],
    customCron: '0 */6 * * *',
    pageLimit: 3,
    targetCollectionId: null,
    enabled: true,
  })
  editorError.value = ''
  editorVisible.value = true
}

function openEdit(schedule: Schedule) {
  editingId.value = schedule.scheduleId
  const frequency = parseScheduleFrequency(schedule.cronExpression)
  Object.assign(form, {
    name: schedule.name,
    monitorUrl: schedule.monitorUrl,
    frequencyMode: frequency.mode,
    intervalHours: frequency.intervalHours,
    time: frequency.time,
    weekdays: frequency.weekdays,
    customCron: frequency.customCron,
    pageLimit: schedule.pageLimit,
    targetCollectionId: schedule.targetCollectionId,
    enabled: schedule.enabled,
  })
  editorError.value = ''
  editorVisible.value = true
}

async function saveEditor() {
  editorError.value = ''
  const name = form.name.trim()
  const monitorUrl = form.monitorUrl.trim()
  if (!name) {
    editorError.value = '請輸入排程名稱'
    return
  }
  try {
    const parsed = new URL(monitorUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
  } catch {
    editorError.value = '請輸入有效的監看網址'
    return
  }

  saving.value = true
  try {
    const cronExpression = buildCronExpression({
      mode: form.frequencyMode,
      intervalHours: form.intervalHours,
      time: form.time,
      weekdays: form.weekdays,
      customCron: form.customCron,
    })
    const payload = {
      name,
      monitorUrl,
      cronExpression,
      pageLimit: Math.max(1, Math.trunc(form.pageLimit || 3)),
      targetCollectionId: form.targetCollectionId,
      enabled: form.enabled,
    }
    const saved = editingId.value
      ? await automation.updateSchedule({ scheduleId: editingId.value, ...payload })
      : await automation.createSchedule(payload)
    selectedId.value = saved.scheduleId
    editorVisible.value = false
    toast.add({
      severity: 'success',
      summary: '排程已儲存',
      detail: `${saved.name} · ${formatScheduleFrequency(saved.cronExpression)}`,
      life: 3000,
    })
  } catch (reason) {
    editorError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    saving.value = false
  }
}

async function runSelected() {
  if (!selectedSchedule.value) return
  try {
    await automation.runNow(selectedSchedule.value.scheduleId)
    toast.add({
      severity: 'info',
      summary: '排程已啟動',
      detail: selectedSchedule.value.name,
      life: 2500,
    })
  } catch (reason) {
    toast.add({
      severity: 'error',
      summary: '無法執行排程',
      detail: reason instanceof Error ? reason.message : String(reason),
      life: 5000,
    })
  }
}

async function toggleSelectedDownloads() {
  const schedule = selectedSchedule.value
  if (!schedule || downloadPauseActionId.value) return

  const wasPaused = schedule.downloadsPaused
  downloadPauseActionId.value = schedule.scheduleId
  try {
    if (wasPaused) {
      await automation.resumeScheduleDownloads(schedule.scheduleId)
    } else {
      await automation.pauseScheduleDownloads(schedule.scheduleId)
    }
    toast.add({
      severity: wasPaused ? 'success' : 'warn',
      summary: wasPaused ? '已恢復自動下載' : '已暫停自動下載',
      detail: wasPaused
        ? `${schedule.name} 的等待工作將繼續下載。`
        : `${schedule.name} 仍會照常監看，新 Gallery 將停在等待佇列。`,
      life: 3500,
    })
  } catch (reason) {
    toast.add({
      severity: 'error',
      summary: wasPaused ? '無法恢復自動下載' : '無法暫停自動下載',
      detail: reason instanceof Error ? reason.message : String(reason),
      life: 5000,
    })
  } finally {
    downloadPauseActionId.value = ''
  }
}

function confirmDelete(schedule: Schedule) {
  confirm.require({
    header: '刪除排程？',
    message: `將刪除「${schedule.name}」與執行紀錄；已開始的下載與 Gallery 會保留。`,
    rejectLabel: '取消',
    acceptLabel: '刪除排程',
    acceptProps: { severity: 'danger' },
    accept: async () => {
      await automation.deleteSchedule(schedule.scheduleId)
      toast.add({
        severity: 'success',
        summary: '排程已刪除',
        detail: schedule.name,
        life: 2500,
      })
    },
  })
}

function statusDot(schedule: Schedule) {
  if (activeRuns.value[schedule.scheduleId])
    return 'bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.15)]'
  if (!schedule.enabled) return 'bg-gray-400'
  if (schedule.lastRunStatus === 'error') return 'bg-red-500'
  return 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]'
}

function formatMonitorCondition(url: string) {
  try {
    const parsed = new URL(url)
    const query = parsed.searchParams.get('f_search') || parsed.searchParams.get('q')
    return query
      ? decodeURIComponent(query.replace(/\+/g, ' '))
      : `${parsed.hostname}${parsed.pathname}`
  } catch {
    return url
  }
}

function runProgress(run: ScheduleRun) {
  const total = run.totalPages ?? run.snapshot.pageLimit
  if (!total) return 0
  return Math.min(100, Math.round((Math.max(0, run.currentPage - 1) / total) * 100))
}

function runStatusLabel(status: ScheduleRunStatus) {
  return { running: '執行中', success: '成功', error: '失敗', cancelled: '已取消' }[
    status
  ]
}

function runSeverity(status: ScheduleRunStatus) {
  if (status === 'success') return 'success'
  if (status === 'error') return 'danger'
  if (status === 'running') return 'info'
  return 'secondary'
}

function formatDate(value?: string) {
  if (!value) return '尚未執行'
  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
</script>

<template>
  <div class="flex h-full min-w-0 overflow-hidden bg-eh-bg">
    <aside
      class="flex w-[300px] shrink-0 flex-col border-r border-eh-border bg-eh-sidebar max-[899px]:w-[76px]"
      aria-label="排程清單"
    >
      <div
        class="flex h-[72px] items-center justify-between gap-2 border-b border-eh-border px-4 max-[899px]:px-3"
      >
        <div class="min-w-0 max-[899px]:hidden">
          <h1 class="font-bold text-eh-text">排程</h1>
          <p class="mt-1 text-xs text-eh-muted">{{ schedules.length }} 個監看工作</p>
        </div>
        <Button
          icon="pi pi-plus"
          aria-label="新增排程"
          title="新增排程"
          @click="openCreate"
        />
      </div>

      <div class="flex-1 space-y-1 overflow-y-auto p-2">
        <button
          v-for="schedule in schedules"
          :key="schedule.scheduleId"
          type="button"
          class="flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-all"
          :class="
            selectedId === schedule.scheduleId
              ? 'border-eh-border bg-eh-panel text-eh-text shadow-sm'
              : 'border-transparent text-eh-muted hover:bg-eh-panel/70 hover:text-eh-text'
          "
          :title="schedule.name"
          @click="selectedId = schedule.scheduleId"
        >
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            :class="statusDot(schedule)"
          ></span>
          <span class="min-w-0 flex-1 max-[899px]:hidden">
            <span class="block truncate font-semibold">{{ schedule.name }}</span>
            <small class="mt-0.5 block truncate">{{
              formatScheduleFrequency(schedule.cronExpression)
            }}</small>
          </span>
          <i
            v-if="activeRuns[schedule.scheduleId]"
            class="pi pi-spin pi-spinner shrink-0 text-eh-accent"
          ></i>
          <i
            v-if="schedule.downloadsPaused"
            class="pi pi-pause-circle shrink-0 text-amber-600"
            aria-label="下載已暫停"
            title="這個排程的下載已暫停"
          ></i>
        </button>

        <div
          v-if="schedules.length === 0"
          class="px-3 py-10 text-center max-[899px]:hidden"
        >
          <i class="pi pi-clock text-3xl text-eh-border/30"></i>
          <p class="mt-3 text-sm font-bold text-eh-text">尚未建立排程</p>
          <p class="mt-1 text-xs leading-5 text-eh-muted">
            新增監看網址，自動檢查前幾頁的新 Gallery。
          </p>
        </div>
      </div>
    </aside>

    <main class="min-w-0 flex-1 overflow-y-auto p-5 lg:p-7">
      <div class="mx-auto max-w-[1500px]">
        <div
          v-if="automation.error"
          class="mb-5 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {{ automation.error }}
        </div>

        <div v-if="selectedSchedule" class="flex flex-col gap-5">
          <header class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-eh-accent">
                Schedule
              </p>
              <h2 class="mt-1 text-2xl font-bold text-eh-text">
                {{ selectedSchedule.name }}
              </h2>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                label="立即執行"
                icon="pi pi-play"
                :loading="Boolean(selectedRun)"
                :disabled="Boolean(selectedRun)"
                @click="runSelected"
              />
              <Button
                :label="selectedSchedule.downloadsPaused ? '恢復下載' : '暫停下載'"
                :icon="selectedSchedule.downloadsPaused ? 'pi pi-play' : 'pi pi-pause'"
                severity="secondary"
                outlined
                :loading="downloadPauseActionId === selectedSchedule.scheduleId"
                :disabled="Boolean(downloadPauseActionId)"
                :aria-label="
                  selectedSchedule.downloadsPaused
                    ? `恢復 ${selectedSchedule.name} 的自動下載`
                    : `暫停 ${selectedSchedule.name} 的自動下載`
                "
                :title="
                  selectedSchedule.downloadsPaused
                    ? '恢復這個排程的等待與自動下載工作'
                    : '暫停這個排程的下載；定時監看仍會繼續'
                "
                @click="toggleSelectedDownloads"
              />
              <Button
                label="編輯"
                icon="pi pi-pencil"
                outlined
                @click="openEdit(selectedSchedule)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                outlined
                aria-label="刪除排程"
                title="刪除排程"
                @click="confirmDelete(selectedSchedule)"
              />
            </div>
          </header>

          <section class="grid min-w-0 gap-4 xl:grid-cols-3" aria-label="排程摘要">
            <article class="schedule-panel min-w-0">
              <h3>狀態</h3>
              <div class="mt-4 space-y-3">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="w-20 text-xs font-bold text-eh-muted">定時監看</span>
                  <Tag
                    :value="
                      selectedRun
                        ? '執行中'
                        : selectedSchedule.enabled
                          ? '已啟用'
                          : '已停止'
                    "
                    :severity="
                      selectedRun
                        ? 'info'
                        : selectedSchedule.enabled
                          ? 'success'
                          : 'secondary'
                    "
                  />
                  <span class="text-sm text-eh-muted">{{
                    formatScheduleFrequency(selectedSchedule.cronExpression)
                  }}</span>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="w-20 text-xs font-bold text-eh-muted">自動下載</span>
                  <Tag
                    :value="selectedSchedule.downloadsPaused ? '已暫停' : '已啟用'"
                    :severity="selectedSchedule.downloadsPaused ? 'warn' : 'success'"
                  />
                </div>
              </div>
            </article>
            <article class="schedule-panel min-w-0">
              <h3>監看條件</h3>
              <p
                class="mt-4 break-words font-medium text-eh-text [overflow-wrap:anywhere]"
                :title="selectedSchedule.monitorUrl"
              >
                {{ formatMonitorCondition(selectedSchedule.monitorUrl) }}
              </p>
              <small class="mt-1 block text-eh-muted"
                >每次檢查前 {{ selectedSchedule.pageLimit }} 頁</small
              >
            </article>
            <article class="schedule-panel min-w-0">
              <h3>目標 Collection</h3>
              <p class="mt-4 font-medium text-eh-text">{{ targetCollectionName }}</p>
              <small class="mt-1 block text-eh-muted">開始下載後自動加入</small>
            </article>
          </section>

          <div
            v-if="selectedSchedule.downloadsPaused"
            class="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            role="status"
          >
            <i class="pi pi-pause-circle mt-0.5" aria-hidden="true"></i>
            <div>
              <strong class="block">這個排程的下載已暫停</strong>
              <span class="mt-0.5 block"
                >定時監看與立即執行仍會照常掃描；新 Gallery
                會停在等待佇列，直到恢復下載。</span
              >
            </div>
          </div>

          <section class="schedule-panel">
            <h3>當前排程</h3>
            <div v-if="selectedRun" class="mt-4 flex flex-col gap-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="font-bold text-eh-text">
                    正在檢查第 {{ selectedRun.currentPage }} /
                    {{ selectedRun.totalPages ?? selectedRun.snapshot.pageLimit }} 頁
                  </p>
                  <small v-if="selectedRun.currentGid" class="text-eh-muted"
                    >正在處理 GID {{ selectedRun.currentGid }}</small
                  >
                </div>
                <Tag value="執行中" severity="info" />
              </div>
              <ProgressBar
                :value="runProgress(selectedRun)"
                :showValue="false"
                class="!h-2"
              />
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div class="metric">
                  <small>已發現</small
                  ><strong>{{ selectedRun.counters.discovered }}</strong>
                </div>
                <div class="metric">
                  <small>新下載</small><strong>{{ selectedRun.counters.queued }}</strong>
                </div>
                <div class="metric">
                  <small>加入集合</small
                  ><strong>{{ selectedRun.counters.existingGalleryAdded }}</strong>
                </div>
                <div class="metric">
                  <small>合併工作</small
                  ><strong>{{ selectedRun.counters.merged }}</strong>
                </div>
                <div class="metric">
                  <small>略過</small><strong>{{ selectedRun.counters.ignored }}</strong>
                </div>
              </div>
            </div>
            <div v-else class="empty-panel mt-4">
              <i class="pi pi-check-circle"></i>
              <div>
                <p>目前沒有執行中的檢查</p>
                <small>{{
                  selectedSchedule.lastRunMessage || '等待下一次排程，或立即執行一次。'
                }}</small>
              </div>
            </div>
          </section>

          <section class="schedule-panel">
            <div class="flex items-center justify-between gap-3">
              <h3>當前下載進度</h3>
              <span class="rounded bg-eh-sidebar px-2 py-1 text-xs font-bold text-eh-text"
                >{{ selectedItems.length }} 個 Gallery</span
              >
            </div>
            <div v-if="selectedItems.length" class="mt-4 flex flex-col gap-3">
              <article
                v-for="item in selectedItems"
                :key="item.queueItemId"
                class="rounded-md border border-eh-border/20 bg-eh-bg/50 p-3"
              >
                <div class="flex flex-wrap items-center gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-bold text-eh-text">
                      {{ item.title }}
                    </p>
                    <small class="text-eh-muted">{{ item.status }}</small>
                  </div>
                  <Tag
                    :value="item.mode"
                    :severity="
                      item.mode === 'completed'
                        ? 'success'
                        : item.mode === 'error'
                          ? 'danger'
                          : item.mode === 'running'
                            ? 'info'
                            : 'secondary'
                    "
                  />
                  <div class="w-36">
                    <ProgressBar :value="item.progress" class="!h-2"
                      ><template #default><span></span></template
                    ></ProgressBar>
                  </div>
                  <Button
                    v-if="item.mode === 'running'"
                    icon="pi pi-pause"
                    text
                    rounded
                    size="small"
                    aria-label="暫停"
                    @click="downloadStore.pauseItem(item.queueItemId)"
                  />
                  <Button
                    v-else-if="item.mode === 'paused' || item.mode === 'pending'"
                    icon="pi pi-play"
                    text
                    rounded
                    size="small"
                    :disabled="selectedSchedule.downloadsPaused"
                    :aria-label="
                      selectedSchedule.downloadsPaused
                        ? `無法開始 ${item.title}；請先恢復排程下載`
                        : `開始下載 ${item.title}`
                    "
                    :title="
                      selectedSchedule.downloadsPaused
                        ? '請先恢復這個排程的自動下載'
                        : '開始這個下載工作'
                    "
                    @click="downloadStore.startItem(item.queueItemId)"
                  />
                </div>
              </article>
            </div>
            <div v-else class="empty-panel mt-4">
              <i class="pi pi-download"></i>
              <div>
                <p>目前沒有這個排程的下載項目</p>
                <small>發現新 Gallery 並開始下載後，進度會顯示在這裡。</small>
              </div>
            </div>
          </section>

          <section class="schedule-panel">
            <h3>最近執行</h3>
            <div v-if="selectedRuns.length" class="mt-3 divide-y divide-eh-border/15">
              <div
                v-for="run in selectedRuns.slice(0, 8)"
                :key="run.runId"
                class="flex flex-wrap items-center gap-3 py-3"
              >
                <Tag
                  :value="runStatusLabel(run.status)"
                  :severity="runSeverity(run.status)"
                />
                <span class="min-w-[8rem] text-sm font-medium text-eh-text">{{
                  formatDate(run.startedAt)
                }}</span>
                <span class="flex-1 text-sm text-eh-muted"
                  >新下載 {{ run.counters.queued }} · 加入集合
                  {{ run.counters.existingGalleryAdded }} · 略過
                  {{ run.counters.ignored }}</span
                >
              </div>
            </div>
            <div v-else class="empty-panel mt-4">
              <i class="pi pi-history"></i>
              <div>
                <p>尚無執行紀錄</p>
                <small>首次排程完成後，摘要會保留在這裡。</small>
              </div>
            </div>
          </section>
        </div>

        <div v-else class="grid min-h-[calc(100vh-7rem)] place-items-center text-center">
          <div class="max-w-md">
            <div
              class="mx-auto grid h-14 w-14 place-items-center rounded-full border border-eh-border/20 bg-eh-panel text-eh-text"
            >
              <i class="pi pi-clock text-xl"></i>
            </div>
            <h2 class="mt-5 text-xl font-bold text-eh-text">建立第一個排程</h2>
            <p class="mt-2 text-sm leading-6 text-eh-muted">
              設定監看網址、執行頻率、檢查頁數與目標 Collection，自動取得新的 Gallery。
            </p>
            <Button label="新增排程" icon="pi pi-plus" class="mt-5" @click="openCreate" />
          </div>
        </div>
      </div>
    </main>

    <Dialog
      v-model:visible="editorVisible"
      modal
      :header="editingId ? '編輯排程' : '新增排程'"
      class="w-[min(40rem,calc(100vw-2rem))]"
    >
      <form
        id="schedule-editor-form"
        class="flex min-w-0 flex-col gap-4 overflow-x-clip"
        @submit.prevent="saveEditor"
      >
        <label class="field"
          ><span>排程名稱</span><InputText v-model="form.name" autofocus required
        /></label>
        <label class="field"
          ><span>監看網址</span
          ><InputText
            v-model="form.monitorUrl"
            placeholder="https://e-hentai.org/?f_search=..."
            required
        /></label>
        <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <label class="field"
            ><span>執行頻率</span
            ><Select
              v-if="form.frequencyMode !== 'custom'"
              v-model="form.frequencyMode"
              aria-label="執行頻率"
              :options="frequencyModeOptions"
              optionLabel="label"
              optionValue="value" /><InputText v-else modelValue="自訂排程" disabled
          /></label>
          <label class="field"
            ><span>檢查前幾頁</span
            ><InputNumber v-model="form.pageLimit" :min="1" :max="100"
          /></label>
        </div>
        <label v-if="form.frequencyMode === 'interval'" class="field"
          ><span>間隔</span
          ><Select
            v-model="form.intervalHours"
            aria-label="排程間隔"
            :options="intervalOptions"
            optionLabel="label"
            optionValue="value"
        /></label>
        <label v-else-if="form.frequencyMode === 'daily'" class="field"
          ><span>每天執行時間</span><InputText v-model="form.time" type="time" required
        /></label>
        <div
          v-else-if="form.frequencyMode === 'weekly'"
          class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]"
        >
          <label class="field"
            ><span>星期</span
            ><MultiSelect
              v-model="form.weekdays"
              aria-label="執行星期"
              :options="weekdayOptions"
              optionLabel="label"
              optionValue="value"
              display="chip"
              placeholder="選擇星期"
          /></label>
          <label class="field"
            ><span>執行時間</span><InputText v-model="form.time" type="time" required
          /></label>
        </div>
        <div
          v-if="form.frequencyMode !== 'custom'"
          class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
        >
          <i class="pi pi-calendar mr-2"></i>{{ frequencySummary }}自動檢查
        </div>
        <details
          class="rounded-md border border-eh-border/20 bg-eh-bg/50 px-4 py-3"
          :open="form.frequencyMode === 'custom'"
        >
          <summary class="cursor-pointer select-none text-sm font-bold text-eh-text">
            進階設定
          </summary>
          <div class="mt-4">
            <label v-if="form.frequencyMode === 'custom'" class="field"
              ><span>自訂 Cron string</span
              ><InputText
                v-model="form.customCron"
                placeholder="0 */6 * * *"
                required
              /><small>標準 5 欄位格式</small></label
            >
            <Button
              v-if="form.frequencyMode !== 'custom'"
              label="改用自訂 Cron"
              severity="secondary"
              outlined
              type="button"
              @click="form.frequencyMode = 'custom'"
            />
            <Button
              v-else
              label="改回友善設定"
              severity="secondary"
              outlined
              type="button"
              @click="form.frequencyMode = 'interval'"
            />
          </div>
        </details>
        <label class="field"
          ><span>目標 Collection</span
          ><Select
            v-model="form.targetCollectionId"
            aria-label="目標 Collection"
            :options="collectionOptions"
            optionLabel="name"
            optionValue="collectionId"
        /></label>
        <label
          class="flex cursor-pointer items-start gap-3 rounded-md border border-eh-border/15 bg-eh-bg/50 p-3"
          ><Checkbox v-model="form.enabled" binary inputId="schedule-enabled" /><span
            ><strong class="block text-sm text-eh-text">啟用排程</strong
            ><small class="text-eh-muted"
              >儲存後等待下一個排程時間，不會立即執行。</small
            ></span
          ></label
        >
        <p
          v-if="editorError"
          class="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700"
        >
          {{ editorError }}
        </p>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button
            label="取消"
            severity="secondary"
            outlined
            type="button"
            @click="editorVisible = false"
          /><Button
            label="儲存"
            type="submit"
            form="schedule-editor-form"
            :loading="saving"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.schedule-panel {
  @apply rounded-lg border border-eh-border/25 bg-eh-panel p-5 shadow-sm;
}

.schedule-panel > h3,
.schedule-panel > div > h3 {
  @apply text-base font-bold text-eh-text;
}

.metric {
  @apply rounded-md border border-eh-border/10 bg-eh-bg/70 px-3 py-2;
}

.metric small {
  @apply block text-[10px] font-bold uppercase tracking-wide text-eh-muted;
}

.metric strong {
  @apply mt-1 block text-xl tabular-nums text-eh-text;
}

.empty-panel {
  @apply flex min-h-[7rem] items-center justify-center gap-3 rounded-md border border-dashed border-eh-border/20 bg-eh-bg/40 p-5 text-eh-muted;
}

.empty-panel > i {
  @apply text-xl text-eh-border/40;
}

.empty-panel p {
  @apply font-bold text-eh-text;
}

.field {
  @apply flex min-w-0 flex-col gap-2 text-sm font-bold text-eh-text;
}

.field :deep(.p-inputtext),
.field :deep(.p-select),
.field :deep(.p-inputnumber),
.field :deep(.p-multiselect) {
  @apply min-w-0 w-full;
}

.field small {
  @apply font-normal text-eh-muted;
}
</style>
