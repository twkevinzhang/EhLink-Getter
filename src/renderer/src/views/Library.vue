<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useLibraryStore } from '@renderer/stores/library'

const toast = useToast()
const libraryStore = useLibraryStore()

const searchTag = ref('')
const ratings = ref(0)
const expunged = ref(false)

const first = ref(0)
const pageSize = 50

const paginatedGalleries = computed(() =>
  libraryStore.galleries.slice(first.value, first.value + pageSize),
)

onMounted(() => {
  libraryStore.checkLibraryExists()
  libraryStore.initProgressEventListener()
})

const handleDownloadMetadata = async () => {
  const result = await libraryStore.downloadLibrary()
  if (result.success) {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: 'Metadata downloaded successfully!',
      life: 3000,
    })
  } else {
    toast.add({
      severity: 'error',
      summary: 'Download Failed',
      detail: result.error,
      life: 5000,
    })
  }
}

const handleSearch = async () => {
  if (!libraryStore.isLibraryDownloaded) {
    toast.add({
      severity: 'warn',
      summary: 'Warning',
      detail: 'Please download library first',
      life: 3000,
    })
    return
  }

  const result = await libraryStore.searchLibrary(searchTag.value, {
    minRating: ratings.value || undefined,
    includeExpunged: expunged.value,
  })
  first.value = 0
  if (result.success) {
    toast.add({
      severity: 'success',
      summary: 'Done',
      detail: `Found ${result.count} results`,
      life: 3000,
    })
  } else {
    toast.add({
      severity: 'error',
      summary: 'Search Failed',
      detail: result.error,
      life: 5000,
    })
  }
}

const handleOpenLink = (link: string) => {
  window.api.openFolder(link)
}

const getCategoryClass = (cat: string | undefined) => {
  const c = (cat || '').toLowerCase()
  if (c.includes('doujinshi')) return 'bg-eh-cat-doujinshi'
  if (c.includes('manga')) return 'bg-eh-cat-manga'
  if (c.includes('artist')) return 'bg-eh-cat-artistcg'
  if (c.includes('game')) return 'bg-eh-cat-gamecg'
  if (c.includes('non-h')) return 'bg-eh-cat-non-h'
  if (c.includes('cosplay')) return 'bg-eh-cat-cosplay'
  return 'bg-gray-500'
}

const formatPosted = (ts: any) => {
  if (!ts) return 'Unknown date'
  if (typeof ts === 'number') return new Date(ts * 1000).toLocaleString()
  return ts
}
</script>

<template>
  <div class="library-view h-full flex flex-col gap-6 p-4">
    <div class="download-section flex flex-col gap-2">
      <Button
        type="button"
        icon="pi pi-download"
        :disabled="libraryStore.isLibraryDownloaded"
        :loading="libraryStore.downloading"
        class="w-full !h-12 !font-bold"
        :label="
          libraryStore.isLibraryDownloaded
            ? 'Library Database Ready'
            : 'Download library.json'
        "
        @click="handleDownloadMetadata"
      />

      <div v-if="libraryStore.downloading" class="mt-2">
        <div class="flex justify-between text-xs mb-1 text-eh-muted">
          <span>Downloading library.json from MEGA...</span>
          <span>{{ libraryStore.downloadProgress }}%</span>
        </div>
        <ProgressBar :value="libraryStore.downloadProgress" class="!h-2">
          <template #default><span></span></template>
        </ProgressBar>
      </div>
    </div>

    <div class="relative">
      <Card
        :class="{ 'opacity-50 grayscale select-none': !libraryStore.isLibraryDownloaded }"
        class="!bg-eh-panel/20 !border-eh-border"
      >
        <template #content>
          <div class="flex flex-col gap-4">
            <div class="flex gap-2">
              <InputText
                v-model="searchTag"
                placeholder="language:chinese tag:color ..."
                class="flex-1 !p-2"
                @keyup.enter="handleSearch"
              />
              <Button icon="pi pi-search" label="Search" @click="handleSearch" />
            </div>
            <div class="flex items-center gap-6 text-sm text-eh-muted">
              <div class="flex items-center gap-2">
                <Checkbox v-model="expunged" binary inputId="expunged-check" />
                <label
                  for="expunged-check"
                  class="text-xs uppercase font-bold cursor-pointer"
                  >Expunged</label
                >
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs uppercase font-bold">Rating ></span>
                <Rating v-model="ratings" :stars="5" />
              </div>
            </div>
          </div>
        </template>
      </Card>

      <div
        v-if="!libraryStore.isLibraryDownloaded"
        class="absolute inset-0 z-50 cursor-not-allowed bg-black/5 backdrop-grayscale"
        @click.stop.prevent
      ></div>
    </div>

    <div
      v-if="!libraryStore.isLibraryDownloaded"
      class="flex-1 flex flex-col items-center justify-center text-eh-muted bg-eh-panel/50 rounded-lg border-2 border-dashed border-eh-border/30"
    >
      <i class="pi pi-database text-4xl mb-4 text-eh-border/50"></i>
      <p class="font-bold">Library Database is required.</p>
      <p class="text-sm italic">Click the button above to download it (approx. 200MB).</p>
    </div>

    <div v-else class="gallery-grid flex-1 overflow-y-auto pr-2">
      <div class="flex flex-col gap-3">
        <div
          v-for="g in paginatedGalleries"
          :key="g.gid || g.link"
          class="eh-panel-card flex overflow-hidden hover:border-eh-accent transition-all duration-200 cursor-pointer hover:shadow-md"
          @click="handleOpenLink(g.link)"
        >
          <!-- Thumbnail Section -->
          <div
            class="w-[100px] aspect-[2/3] bg-eh-sidebar border-r border-eh-border flex items-center justify-center text-eh-muted shrink-0 overflow-hidden"
          >
            <img v-if="g.thumb" :src="g.thumb" class="w-full h-full object-cover" />
            <i v-else class="pi pi-image text-2xl opacity-20"></i>
          </div>

          <!-- Metadata Section -->
          <div class="flex-1 p-3 flex flex-col gap-2 min-w-0">
            <div class="flex items-start justify-between gap-4">
              <span
                class="font-bold text-eh-text hover:underline text-sm leading-tight line-clamp-2 min-w-0"
                >{{ g.title }}</span
              >
              <div class="cat-badge shrink-0" :class="getCategoryClass(g.category)">
                {{ g.category || 'Unknown' }}
              </div>
            </div>

            <div class="flex flex-wrap gap-1 mt-1">
              <span
                v-if="g.language"
                class="text-[9px] px-1.5 py-0.5 bg-eh-sidebar border border-eh-border/30 rounded-sm text-eh-muted uppercase font-bold"
              >
                {{ g.language }}
              </span>
              <span
                v-for="tag in (g.tags || []).slice(0, 5)"
                :key="tag"
                class="text-[9px] px-1.5 py-0.5 bg-white/40 border border-eh-border/20 rounded-sm text-eh-muted"
              >
                {{ tag }}
              </span>
              <span
                v-if="(g.tags || []).length > 5"
                class="text-[9px] text-eh-muted flex items-center"
                >...</span
              >
            </div>

            <div
              class="flex items-center justify-between text-[10px] text-eh-muted mt-auto"
            >
              <div class="flex items-center gap-2">
                <Rating :modelValue="Number(g.rating) || 0" disabled :stars="5" />
                <span class="font-bold">{{ g.rating }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span v-if="g.uploader" class="italic truncate max-w-[80px]">{{
                  g.uploader
                }}</span>
                <span class="font-mono">{{ formatPosted(g.posted) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="libraryStore.galleries.length === 0"
          class="text-center py-20 text-eh-muted italic"
        >
          <p>No galleries found. Start searching or check your DB path.</p>
        </div>
      </div>
    </div>

    <div
      v-if="libraryStore.isLibraryDownloaded && libraryStore.galleries.length > 0"
      class="flex justify-center pt-2"
    >
      <Paginator
        v-model:first="first"
        :rows="pageSize"
        :totalRecords="libraryStore.galleries.length"
        template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
        class="!bg-transparent !p-0"
      />
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

:deep(.p-rating-item) {
  @apply !w-3 !h-3;
}
:deep(.p-rating-icon) {
  @apply text-yellow-500 !text-[10px];
}
</style>
