<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import MultiSelect from 'primevue/multiselect'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useFetchStore, type DraftGallery } from '@renderer/stores/fetch'
import DownloadConfigPanel from '@renderer/components/shared/DownloadConfigPanel.vue'
import { useDownloadStore } from '@renderer/stores/download'
import { storeToRefs } from 'pinia'
import { useAutomationStore } from '@renderer/stores/automation'
import { useWorkspaceStore } from '@renderer/stores/workspace'

const scraperStore = useFetchStore()
const downloadStore = useDownloadStore()
const automation = useAutomationStore()
const workspace = useWorkspaceStore()
const { galleries } = storeToRefs(scraperStore)
const toast = useToast()
const confirm = useConfirm()

const useZip = ref(true)
const zipPass = ref('')
const selectedCollectionIds = ref<string[]>([])
const manualUrl = ref('')

// Pagination state
const first = ref(0)
const pageSize = ref(20)
// Filter state
const searchQuery = ref('')

// Selection state
const selectedIds = ref<string[]>([])

const isGallerySelected = (gid: string) => selectedIds.value.includes(gid)

const toggleGallery = (gid: string) => {
  const idx = selectedIds.value.indexOf(gid)
  if (idx !== -1) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(gid)
  }
}

const isAllSelected = computed(() => {
  return (
    filteredGalleries.value.length > 0 &&
    filteredGalleries.value.every((g: DraftGallery) => selectedIds.value.includes(g.gid))
  )
})

const isIndeterminate = computed(() => {
  const selectedInFiltered = filteredGalleries.value.filter((g: DraftGallery) =>
    selectedIds.value.includes(g.gid),
  ).length
  return selectedInFiltered > 0 && selectedInFiltered < filteredGalleries.value.length
})

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    const filteredIds = new Set(filteredGalleries.value.map((g) => g.gid))
    selectedIds.value = selectedIds.value.filter((id) => !filteredIds.has(id))
  } else {
    const toAdd = filteredGalleries.value
      .map((g) => g.gid)
      .filter((id) => !selectedIds.value.includes(id))
    selectedIds.value = [...selectedIds.value, ...toAdd]
  }
}

// Filter Computed
const filteredGalleries = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return galleries.value
  return galleries.value.filter(
    (g: DraftGallery) =>
      g.title.toLowerCase().includes(query) || g.link.toLowerCase().includes(query),
  )
})

// Pagination Computed
const paginatedGalleries = computed(() => {
  const start = first.value
  const end = start + pageSize.value
  return filteredGalleries.value.slice(start, end)
})

const isPageSelected = computed(() => {
  if (paginatedGalleries.value.length === 0) return false
  return paginatedGalleries.value.every((g: DraftGallery) =>
    selectedIds.value.includes(g.gid),
  )
})

const isPageIndeterminate = computed(() => {
  const pageSelectedCount = paginatedGalleries.value.filter((g: DraftGallery) =>
    selectedIds.value.includes(g.gid),
  ).length
  return pageSelectedCount > 0 && pageSelectedCount < paginatedGalleries.value.length
})

const toggleSelectPage = () => {
  if (isPageSelected.value) {
    const pageIds = new Set(paginatedGalleries.value.map((g) => g.gid))
    selectedIds.value = selectedIds.value.filter((id) => !pageIds.has(id))
  } else {
    const toAdd = paginatedGalleries.value
      .map((g) => g.gid)
      .filter((id) => !selectedIds.value.includes(id))
    selectedIds.value = [...selectedIds.value, ...toAdd]
  }
}

const handleAddManual = async () => {
  try {
    if (!manualUrl.value) return
    await scraperStore.addGallery(manualUrl.value)
    manualUrl.value = ''
    toast.add({
      severity: 'success',
      summary: 'Added',
      detail: 'Gallery added to draft',
      life: 3000,
    })
  } catch (error: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: error instanceof Error ? error.message : String(error),
      life: 5000,
    })
  }
}

const handleAddSelectedToQueue = async () => {
  if (!workspace.configured) {
    await workspace.select()
    if (!workspace.configured) return
  }
  if (selectedIds.value.length === 0) {
    toast.add({
      severity: 'warn',
      summary: 'Warning',
      detail: 'No galleries selected',
      life: 3000,
    })
    return
  }

  const selectedGalleriesList = galleries.value.filter((g) =>
    selectedIds.value.includes(g.gid),
  )
  const jobId = `draft-${Date.now()}`
  try {
    await downloadStore.addToQueue(
      jobId,
      'Draft Selection',
      selectedGalleriesList,
      useZip.value,
      zipPass.value,
      selectedCollectionIds.value,
    )
  } catch (reason) {
    toast.add({
      severity: 'error',
      summary: 'Download Failed',
      detail: reason instanceof Error ? reason.message : String(reason),
      life: 5000,
    })
    return
  }

  selectedGalleriesList.forEach((g) => {
    scraperStore.removeGallery(g.gid)
  })

  selectedIds.value = []
  toast.add({
    severity: 'success',
    summary: 'Queued',
    detail: `Added ${selectedGalleriesList.length} galleries to download queue`,
    life: 3000,
  })
}

const handleDeleteGallery = (gid: string) => {
  scraperStore.removeGallery(gid)
  const idx = selectedIds.value.indexOf(gid)
  if (idx !== -1) selectedIds.value.splice(idx, 1)
  if (paginatedGalleries.value.length === 0 && first.value > 0) {
    first.value = Math.max(0, first.value - pageSize.value)
  }
}

const handleClearDrafts = () => {
  confirm.require({
    message: 'This will clear all items in the draft list. Continue?',
    header: 'Clear Drafts',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Clear All',
    rejectLabel: 'Cancel',
    acceptClass: 'p-button-danger',
    accept: () => {
      scraperStore.clearGalleries()
      selectedIds.value = []
      first.value = 0
      toast.add({
        severity: 'success',
        summary: 'Cleared',
        detail: 'Draft list cleared',
        life: 3000,
      })
    },
  })
}

watch(searchQuery, () => {
  first.value = 0
  selectedIds.value = []
})
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full overflow-hidden">
    <!-- Manual Add Panel -->
    <div class="eh-panel-card">
      <div class="eh-header">Add Gallery Link</div>
      <div class="p-4 flex gap-2">
        <InputText
          v-model="manualUrl"
          class="flex-1 !p-2"
          placeholder="https://e-hentai.org/g/XXXXX/XXXXXX/"
          @keyup.enter="handleAddManual"
        />
        <Button label="Add" icon="pi pi-plus" @click="handleAddManual" />
      </div>
    </div>

    <!-- Draft List Panel -->
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header flex justify-between items-center">
        <span>Ready to Download (Draft List)</span>
      </div>

      <!-- Filter Input or Action -->
      <div
        class="flex px-4 py-2 border-b border-eh-border/50 bg-eh-panel/5 gap-4 items-center"
      >
        <InputText
          v-model="searchQuery"
          class="w-1/2 !p-1.5 !text-xs"
          placeholder="Filter by title or link..."
        />

        <div class="flex items-center gap-2">
          <Checkbox
            :modelValue="isPageSelected"
            :indeterminate="isPageIndeterminate"
            binary
            @change="toggleSelectPage"
          />
          <span class="text-[10px] uppercase font-bold text-eh-accent">Page</span>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            :modelValue="isAllSelected"
            :indeterminate="isIndeterminate"
            binary
            @change="toggleSelectAll"
          />
          <span class="text-[10px] uppercase font-bold text-eh-accent">Filtered</span>
        </div>
        <div class="flex-1"></div>
        <Button
          label="Clear List"
          icon="pi pi-trash"
          severity="danger"
          text
          size="small"
          class="!text-[10px] !p-1"
          @click="handleClearDrafts"
        />
      </div>

      <div class="p-2 flex-1 overflow-y-auto bg-white/30">
        <div class="flex flex-col gap-1">
          <div
            v-for="g in paginatedGalleries"
            :key="g.gid"
            class="flex items-center gap-3 p-2 bg-eh-panel/20 border-l-4 transition-all"
            :class="
              isGallerySelected(g.gid)
                ? 'border-eh-accent bg-eh-panel/40 shadow-inner'
                : 'border-eh-border hover:bg-eh-panel/30'
            "
          >
            <Checkbox
              :modelValue="isGallerySelected(g.gid)"
              binary
              @change="toggleGallery(g.gid)"
            />
            <div class="flex-1 min-w-0">
              <div
                class="text-[12px] font-bold truncate transition-colors flex items-center gap-2"
                :class="
                  isGallerySelected(g.gid) ? 'text-eh-text' : 'text-eh-muted opacity-60'
                "
              >
                <span class="truncate">{{ g.title }}</span>
                <span
                  v-if="g.imagecount"
                  class="text-[10px] bg-eh-accent/10 text-eh-accent px-1.5 py-0.5 rounded-sm whitespace-nowrap"
                >
                  {{ g.imagecount }}P
                </span>
              </div>
              <div class="text-[10px] text-eh-muted truncate opacity-70">
                {{ g.link }}
              </div>
            </div>
            <Button
              icon="pi pi-times"
              severity="danger"
              text
              rounded
              size="small"
              class="!w-6 !h-6"
              @click="handleDeleteGallery(g.gid)"
            />
          </div>

          <div
            v-if="galleries.length === 0"
            class="text-center py-10 text-eh-muted text-xs italic"
          >
            No drafts in the list. Start fetching or add links manually.
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="filteredGalleries.length > pageSize"
        class="border-t border-eh-border bg-eh-panel/10"
      >
        <Paginator
          v-model:first="first"
          :rows="pageSize"
          :totalRecords="filteredGalleries.length"
          template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
          class="!bg-transparent !p-1"
        />
      </div>
    </div>

    <!-- Configuration Panel -->
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
      <DownloadConfigPanel v-model:useZip="useZip" v-model:zipPass="zipPass" />
      <div class="eh-panel-card overflow-hidden">
        <div class="eh-header">加入 Collections</div>
        <div class="p-4">
          <MultiSelect
            v-model="selectedCollectionIds"
            :options="automation.sortedCollections"
            optionLabel="name"
            optionValue="collectionId"
            display="chip"
            placeholder="未選擇時保持未分類"
            class="w-full"
          />
          <p class="mt-2 text-[10px] leading-4 text-eh-muted">
            Gallery 從開始下載起才會建立正式紀錄，並加入所選 Collections；同一 Gallery
            可以同時屬於多個 Collection。
          </p>
        </div>
      </div>
    </div>

    <div
      v-if="!workspace.configured"
      class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900"
    >
      <span>開始下載前，請先選擇工作資料夾。</span>
      <Button
        label="選擇工作資料夾"
        icon="pi pi-folder-open"
        outlined
        :loading="workspace.loading"
        @click="workspace.select"
      />
    </div>

    <div class="flex gap-2">
      <Button
        :label="
          workspace.configured
            ? `Start Download (${selectedIds.length} Selected)`
            : '請先設定工作資料夾'
        "
        :disabled="selectedIds.length === 0 || !workspace.configured"
        class="w-full !bg-eh-border !border-eh-border !rounded-none !h-10 font-bold uppercase tracking-widest"
        @click="handleAddSelectedToQueue"
      />
    </div>
  </div>
</template>

<style scoped>
.eh-panel-card {
  transition: all 0.2s ease;
}
</style>
