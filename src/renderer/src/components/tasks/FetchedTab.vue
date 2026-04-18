<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import ToggleSwitch from 'primevue/toggleswitch'
import { useFetchStore } from '@renderer/stores/fetch'
import { useDownloadStore } from '@renderer/stores/download'
import { storeToRefs } from 'pinia'

const scraperStore = useFetchStore()
const downloadStore = useDownloadStore()
const { galleries } = storeToRefs(scraperStore)
const toast = useToast()
const confirm = useConfirm()

interface DraftGallery {
  gid: string
  title: string
  link: string
}

const targetPath = ref('')
const useZip = ref(true)
const zipPass = ref('')
const manualUrl = ref('')

// Pagination state
const first = ref(0)
const pageSize = ref(20)
const currentPage = computed(() => Math.floor(first.value / pageSize.value) + 1)

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

const handleAddManual = () => {
  try {
    if (!manualUrl.value) return
    scraperStore.addGallery(manualUrl.value)
    manualUrl.value = ''
    toast.add({
      severity: 'success',
      summary: 'Added',
      detail: 'Gallery added to draft',
      life: 3000,
    })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 5000 })
  }
}

const handleBrowse = async () => {
  try {
    const result = await scraperStore.selectDirectory()
    if (result) {
      targetPath.value = result
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to select folder',
      life: 5000,
    })
  }
}

const handlePlaceholder = (placeholder: string) => {
  targetPath.value = (targetPath.value || '') + placeholder
}

const handleAddSelectedToQueue = async () => {
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
  downloadStore.addToQueue(
    jobId,
    'Draft Selection',
    selectedGalleriesList,
    targetPath.value,
    useZip.value,
    zipPass.value,
  )

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

onMounted(async () => {
  if (!targetPath.value || targetPath.value.trim() === '') {
    targetPath.value = await downloadStore.getDefaultDownloadsPath()
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
                class="text-[12px] font-bold truncate transition-colors"
                :class="
                  isGallerySelected(g.gid) ? 'text-eh-text' : 'text-eh-muted opacity-60'
                "
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
    <div class="eh-panel-card">
      <div class="eh-header">Download Configuration</div>
      <div class="p-4 flex flex-col gap-4 text-xs">
        <div class="flex flex-col gap-2">
          <label
            class="text-[10px] text-eh-muted font-bold uppercase flex items-center gap-2"
          >
            Target Path:
          </label>
          <div class="flex gap-2">
            <InputText v-model="targetPath" size="small" class="flex-1 !p-1.5 !text-xs" />
            <Button
              label="Browse"
              size="small"
              outlined
              class="!py-1 !px-3"
              @click="handleBrowse"
            />
          </div>
          <div class="flex gap-2 mt-1">
            <Button
              v-for="p in ['{EN_TITLE}', '{GID}', '{JP_TITLE}']"
              :key="p"
              :label="p"
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
        :label="`Start Download (${selectedIds.length} Selected)`"
        :disabled="selectedIds.length === 0"
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
