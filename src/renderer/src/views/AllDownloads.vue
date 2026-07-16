<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import MultiSelect from 'primevue/multiselect'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import DownloadingTab from '@renderer/components/tasks/DownloadingTab.vue'
import { useAutomationStore } from '@renderer/stores/automation'
import {
  useDownloadStore,
  type ManualDownloadBatchResult,
} from '@renderer/stores/download'
import { useWorkspaceStore } from '@renderer/stores/workspace'

const automation = useAutomationStore()
const downloadStore = useDownloadStore()
const workspace = useWorkspaceStore()
const toast = useToast()
const { sortedCollections } = storeToRefs(automation)

const manualDialogVisible = ref(false)
const collectionDialogVisible = ref(false)
const urls = ref('')
const selectedCollectionIds = ref<string[]>([])
const submitting = ref(false)
const submitError = ref('')
const result = ref<ManualDownloadBatchResult>()
const newCollectionName = ref('')
const collectionError = ref('')
const creatingCollection = ref(false)
let loadedWorkspacePath = ''

const inputCount = computed(
  () => urls.value.split(/\r?\n/).filter((line) => line.trim()).length,
)
const resultSummary = computed(() => {
  if (!result.value) return ''
  return `新下載 ${result.value.queued} 本、合併等待工作 ${result.value.merged} 本、現有 Gallery ${result.value.existing} 本、無效 ${result.value.invalid.length} 筆。`
})

watch(
  () => workspace.path,
  async (path) => {
    if (!path || path === loadedWorkspacePath) return
    loadedWorkspacePath = path
    await Promise.all([downloadStore.load(), automation.load()])
  },
  { immediate: true },
)

function openManualDialog() {
  if (!workspace.configured) return
  submitError.value = ''
  result.value = undefined
  manualDialogVisible.value = true
}

function setManualDialogVisible(visible: boolean) {
  if (!visible && submitting.value) return
  manualDialogVisible.value = visible
}

async function submitDownloads() {
  const lines = urls.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) {
    submitError.value = '請輸入至少一個 Gallery 網址。'
    return
  }

  submitting.value = true
  submitError.value = ''
  result.value = undefined
  try {
    const nextResult = await downloadStore.manualDownloadBatch({
      urls: lines,
      collectionIds: selectedCollectionIds.value,
    })
    result.value = nextResult
    await automation.refreshCollectionsAndGalleries()

    if (nextResult.invalid.length) return

    const detail = `新下載 ${nextResult.queued} 本、合併 ${nextResult.merged} 本、已存在 ${nextResult.existing} 本。`
    urls.value = ''
    selectedCollectionIds.value = []
    manualDialogVisible.value = false
    toast.add({
      severity: 'success',
      summary: '手動下載已處理',
      detail,
      life: 3600,
    })
  } catch (reason) {
    submitError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    submitting.value = false
  }
}

async function createCollection() {
  const name = newCollectionName.value.trim()
  if (!name) {
    collectionError.value = '請輸入 Collection 名稱。'
    return
  }

  creatingCollection.value = true
  collectionError.value = ''
  try {
    const collection = await automation.createCollection(name)
    selectedCollectionIds.value = [
      ...new Set([...selectedCollectionIds.value, collection.collectionId]),
    ]
    newCollectionName.value = ''
    collectionDialogVisible.value = false
  } catch (reason) {
    collectionError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    creatingCollection.value = false
  }
}
</script>

<template>
  <div
    class="mx-auto flex h-full w-full max-w-[1100px] min-w-0 flex-col gap-5 overflow-hidden"
  >
    <header
      class="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p class="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-eh-muted">
          Downloads
        </p>
        <h1 class="text-2xl font-bold text-eh-text">全部下載</h1>
        <p class="mt-1 text-sm text-eh-muted">
          查看所有來源的下載情況，或批次貼上單本 Gallery 網址。
        </p>
      </div>
      <Button
        label="手動新增下載"
        icon="pi pi-plus"
        :disabled="!workspace.configured"
        @click="openManualDialog"
      />
    </header>

    <div
      v-if="!workspace.configured"
      class="shrink-0 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950"
      role="status"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-start gap-3">
          <i class="pi pi-folder-open mt-0.5"></i>
          <div>
            <p class="text-sm font-bold">設定 Workspace 後即可管理下載</p>
            <p class="mt-1 text-xs opacity-80">
              頁面仍會顯示下載概況，但手動新增與工作操作暫時停用。
            </p>
          </div>
        </div>
        <Button
          label="選擇工作資料夾"
          icon="pi pi-folder"
          severity="secondary"
          size="small"
          :loading="workspace.loading"
          @click="workspace.select"
        />
      </div>
    </div>

    <div
      class="flex min-h-0 flex-1 flex-col rounded-md border border-eh-border bg-eh-panel p-4 shadow-sm"
    >
      <DownloadingTab :disabled="!workspace.configured" />
    </div>
  </div>

  <Dialog
    :visible="manualDialogVisible"
    modal
    header="手動新增下載"
    :closable="!submitting"
    :closeOnEscape="!submitting"
    :dismissableMask="!submitting"
    class="w-[min(48rem,calc(100vw-2rem))]"
    @update:visible="setManualDialogVisible"
  >
    <form
      id="manual-download-form"
      class="flex flex-col gap-5"
      @submit.prevent="submitDownloads"
    >
      <div>
        <label for="manual-download-urls" class="text-sm font-bold text-eh-text">
          Gallery 網址
        </label>
        <p class="mb-2 mt-1 text-xs text-eh-muted">
          每行一個 E-Hentai Gallery 網址；無效項目會略過並在完成後彙總。
        </p>
        <Textarea
          id="manual-download-urls"
          v-model="urls"
          rows="7"
          placeholder="https://e-hentai.org/g/123456/abcdef1234/&#10;https://e-hentai.org/g/789012/1234abcdef/"
          fluid
          autoResize
          :disabled="submitting"
        />
        <p class="mt-1 text-right text-[11px] text-eh-muted">{{ inputCount }} 筆</p>
      </div>

      <div>
        <label for="manual-download-collections" class="text-sm font-bold text-eh-text">
          加入 Collections
        </label>
        <p class="mb-2 mt-1 text-xs text-eh-muted">
          可複選；未選擇時不指定 Collection，下載後會顯示於動態「未分類」。
        </p>
        <div class="flex items-start gap-2">
          <MultiSelect
            id="manual-download-collections"
            v-model="selectedCollectionIds"
            :options="sortedCollections"
            optionLabel="name"
            optionValue="collectionId"
            display="chip"
            placeholder="未分類"
            class="min-w-0 flex-1"
            fluid
            :disabled="submitting"
          />
          <Button
            v-tooltip="'建立 Collection'"
            icon="pi pi-plus"
            severity="secondary"
            outlined
            aria-label="建立 Collection"
            :disabled="submitting"
            @click="collectionDialogVisible = true"
          />
        </div>
      </div>

      <div
        v-if="submitError"
        class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
      >
        {{ submitError }}
      </div>
      <div
        v-if="result"
        class="rounded-md border px-3 py-3 text-sm"
        :class="
          result.invalid.length
            ? 'border-amber-300 bg-amber-50 text-amber-900'
            : 'border-green-300 bg-green-50 text-green-800'
        "
        role="status"
      >
        <p class="font-bold">批次處理結果</p>
        <p class="mt-1">{{ resultSummary }}</p>
        <ul
          v-if="result.invalid.length"
          class="mt-2 max-h-24 list-disc overflow-y-auto pl-5 text-xs"
        >
          <li v-for="item in result.invalid" :key="item" class="break-all">{{ item }}</li>
        </ul>
      </div>

      <div class="flex flex-wrap justify-end gap-2">
        <Button
          label="取消"
          severity="secondary"
          outlined
          :disabled="submitting"
          @click="setManualDialogVisible(false)"
        />
        <Button
          type="submit"
          label="建立下載工作"
          icon="pi pi-download"
          :loading="submitting"
          :disabled="!inputCount"
        />
      </div>
    </form>
  </Dialog>

  <Dialog
    v-model:visible="collectionDialogVisible"
    modal
    header="建立 Collection"
    class="w-[min(28rem,calc(100vw-2rem))]"
  >
    <form class="flex flex-col gap-4" @submit.prevent="createCollection">
      <div>
        <label
          for="download-new-collection"
          class="mb-2 block text-sm font-bold text-eh-text"
        >
          Collection 名稱
        </label>
        <InputText
          id="download-new-collection"
          v-model="newCollectionName"
          fluid
          autofocus
          :disabled="creatingCollection"
        />
      </div>
      <p v-if="collectionError" class="text-sm text-red-600" role="alert">
        {{ collectionError }}
      </p>
      <div class="flex justify-end gap-2">
        <Button
          label="取消"
          severity="secondary"
          outlined
          :disabled="creatingCollection"
          @click="collectionDialogVisible = false"
        />
        <Button type="submit" label="建立並選取" :loading="creatingCollection" />
      </div>
    </form>
  </Dialog>
</template>
