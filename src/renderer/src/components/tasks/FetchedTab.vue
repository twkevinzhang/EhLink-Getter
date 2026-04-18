<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import ToggleSwitch from 'primevue/toggleswitch'
import { useFetchStore } from '../../stores/fetch'
import { useDownloadStore } from '../../stores/download'
import { useConfigStore } from '../../stores/config'
import { storeToRefs } from 'pinia'

const scraperStore = useFetchStore()
const downloadStore = useDownloadStore()
const configStore = useConfigStore()
const { galleries } = storeToRefs(scraperStore)
const toast = useToast()
const confirm = useConfirm()

interface DraftGallery {
  id: string
  title: string
  link: string
}

const targetPath = ref('')
const useZip = ref(true)
const zipPass = ref('')
const manualUrl = ref('')

const displayPath = computed({
  get: () => {
    if (configStore.config.storage_strategy === 'eh_id') {
      return 'output/{ID}'
    }
    return targetPath.value
  },
  set: (val) => {
    targetPath.value = val
  }
})

// Pagination state
const first = ref(0)
const pageSize = ref(20)
const currentPage = computed(() => Math.floor(first.value / pageSize.value) + 1)

// Filter state
const searchQuery = ref('')

// Selection state
const selectedIds = ref<Set<string>>(new Set())

const isGallerySelected = (id: string) => selectedIds.value.has(id)

const toggleGallery = (id: string) => {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
}

const isAllSelected = computed(() => {
  return (
    filteredGalleries.value.length > 0 &&
    filteredGalleries.value.every((g: DraftGallery) => selectedIds.value.has(g.id))
  )
})

const isIndeterminate = computed(() => {
  const selectedInFiltered = filteredGalleries.value.filter((g: DraftGallery) =>
    selectedIds.value.has(g.id)
  ).length
  return selectedInFiltered > 0 && selectedInFiltered < filteredGalleries.value.length
})

const toggleSelectAll = () => {
  const val = !isAllSelected.value
  if (val) {
    filteredGalleries.value.forEach((g: DraftGallery) => selectedIds.value.add(g.id))
  } else {
    filteredGalleries.value.forEach((g: DraftGallery) => selectedIds.value.delete(g.id))
  }
}

// Filter Computed
const filteredGalleries = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return galleries.value
  return galleries.value.filter(
    (g: DraftGallery) =>
      g.title.toLowerCase().includes(query) || g.link.toLowerCase().includes(query)
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
  return paginatedGalleries.value.every((g: DraftGallery) => selectedIds.value.has(g.id))
})

const isPageIndeterminate = computed(() => {
  const pageSelectedCount = paginatedGalleries.value.filter((g: DraftGallery) =>
    selectedIds.value.has(g.id)
  ).length
  return pageSelectedCount > 0 && pageSelectedCount < paginatedGalleries.value.length
})

const toggleSelectPage = () => {
  const val = !isPageSelected.value
  if (val) {
    paginatedGalleries.value.forEach((g: DraftGallery) => selectedIds.value.add(g.id))
  } else {
    paginatedGalleries.value.forEach((g: DraftGallery) => selectedIds.value.delete(g.id))
  }
}

const handleAddManual = () => {
  try {
    if (!manualUrl.value) return
    scraperStore.addGallery(manualUrl.value)
    manualUrl.value = ''
    toast.add({ severity: 'success', summary: 'Added', detail: 'Gallery added to draft', life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 5000 })
  }
}

const handleBrowse = async () => {
  try {
    const result = await window.api.selectDirectory()
    if (result) {
      targetPath.value = result
    }
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to select folder', life: 5000 })
  }
}

const handlePlaceholder = (placeholder: string) => {
  targetPath.value = (targetPath.value || '') + placeholder
}

const handleAddSelectedToQueue = async () => {
  if (selectedIds.value.size === 0) {
    toast.add({ severity: 'warn', summary: 'Warning', detail: 'No galleries selected', life: 3000 })
    return
  }

  const selectedGalleriesList = galleries.value.filter((g) => selectedIds.value.has(g.id))
  const jobId = `draft-${Date.now()}`
  downloadStore.addToQueue(
    jobId,
    'Draft Selection',
    selectedGalleriesList,
    useZip.value,
    zipPass.value
  )

  selectedGalleriesList.forEach((g) => {
    scraperStore.removeGallery(g.id)
  })

  selectedIds.value.clear()
  toast.add({
    severity: 'success',
    summary: 'Queued',
    detail: `Added ${selectedGalleriesList.length} galleries to download queue`,
    life: 3000
  })
}

const handleDeleteGallery = (id: string) => {
  scraperStore.removeGallery(id)
  selectedIds.value.delete(id)
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
      selectedIds.value.clear()
      first.value = 0
      toast.add({ severity: 'success', summary: 'Cleared', detail: 'Draft list cleared', life: 3000 })
    }
  })
}

// targetPath is now a local state and not persisted to global config
watch(targetPath, (val) => {
  console.log('[FetchedTab] Target path updated:', val)
})

watch(searchQuery, () => {
  first.value = 0
})

onMounted(async () => {
  if (!targetPath.value || targetPath.value.trim() === '') {
    try {
      const defaultPath = await window.api.getDownloadsPath()
      if (defaultPath) {
        targetPath.value = defaultPath + '/{EN_TITLE}'
      }
    } catch (error) {
      console.error('Failed to get default downloads path:', error)
    }
  }
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
      <div class="flex px-4 py-2 border-b border-eh-border/50 bg-eh-panel/5 gap-4 items-center">
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
            :key="g.id"
            class="flex items-center gap-3 p-2 bg-eh-panel/20 border-l-4 transition-all"
            :class="
              isGallerySelected(g.id)
                ? 'border-eh-accent bg-eh-panel/40 shadow-inner'
                : 'border-eh-border hover:bg-eh-panel/30'
            "
          >
            <Checkbox
              :modelValue="isGallerySelected(g.id)"
              binary
              @change="toggleGallery(g.id)"
            />
            <div class="flex-1 min-w-0">
              <div
                class="text-[12px] font-bold truncate transition-colors"
                :class="isGallerySelected(g.id) ? 'text-eh-text' : 'text-eh-muted opacity-60'"
              >
                {{ g.title }}
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
              @click="handleDeleteGallery(g.id)"
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
    <div class="eh-panel-card">
      <div class="eh-header">Download Configuration</div>
      <div class="p-4 flex flex-col gap-4 text-xs">
        <div class="flex flex-col gap-2">
          <label class="text-[10px] text-eh-muted font-bold uppercase flex items-center gap-2">
            Target Path:
            <span
              v-if="configStore.config.storage_strategy === 'eh_id'"
              class="text-red-400 font-normal lowercase italic"
            >
              (Locked by EH_ID Strategy)
            </span>
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
              @click="handleBrowse"
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
      </div>
    </div>

    <div class="flex gap-2">
      <Button
        :label="`Start Download (${selectedIds.size} Selected)`"
        :disabled="selectedIds.size === 0"
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
