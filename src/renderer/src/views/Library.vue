<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Search, Download } from '@element-plus/icons-vue'
import { useDownloadStore } from '../stores/download'
import { useConfigStore } from '../stores/config'
import { ElMessage } from 'element-plus'

const downloadStore = useDownloadStore()
const configStore = useConfigStore()
const searchTag = ref('')
const ratings = ref(0)
const expunged = ref(false)

const isMetadataDownloaded = ref(false)
const downloading = ref(false)
const downloadProgress = ref(0)

const checkMetadata = async () => {
  const exists = await window.api.checkMetadataExists()
  console.log('[Library] Metadata exists check:', exists)
  isMetadataDownloaded.value = exists
  if (exists) {
    const userDataPath = await window.api.getUserDataPath()
    const pathSeparator = window.electron.process.platform === 'win32' ? '\\' : '/'
    configStore.updateConfig({ metadata_path: `${userDataPath}${pathSeparator}metadata.json` })
  }
}

onMounted(() => {
  checkMetadata()
  window.api.onDownloadProgress((data) => {
    downloading.value = true
    if (data.total > 0) {
      downloadProgress.value = Math.round((data.loaded / data.total) * 100)
    }
  })
})

const handleDownloadMetadata = async () => {
  try {
    downloading.value = true
    downloadProgress.value = 0
    const result = await window.api.downloadMetadata()
    downloading.value = false

    if (result.success) {
      isMetadataDownloaded.value = true
      const userDataPath = await window.api.getUserDataPath()
      const pathSeparator = window.electron.process.platform === 'win32' ? '\\' : '/'
      configStore.updateConfig({ metadata_path: `${userDataPath}${pathSeparator}metadata.json` })
      ElMessage.success('Metadata downloaded successfully!')
    } else {
      ElMessage.error(`Download failed: ${result.error}`)
    }
  } catch (err: any) {
    downloading.value = false
    ElMessage.error(`Error: ${err.message}`)
  }
}

const handleSearch = async () => {
  if (!isMetadataDownloaded.value) {
    ElMessage.warning('Please download metadata first')
    return
  }
  try {
    const payload = {
      metadata_path: configStore.config.metadata_path,
      keywords: searchTag.value,
      // Requesting all common fields from metadata.json
      fields: [
        'title',
        'link',
        'rating',
        'category',
        'thumb',
        'language',
        'posted',
        'uploader',
        'gid',
        'tags',
      ],
    }
    const response = await window.api.mapMetadata(payload)
    if (response && response.results) {
      downloadStore.libraryGalleries = response.results
      ElMessage.success(`Found ${response.results.length} galleries`)
    } else if (response && response.error) {
      ElMessage.error(`Search failed: ${response.error}`)
    }
  } catch (error: any) {
    ElMessage.error(`Search failed: ${error.message}`)
  }
}

const handleOpenLink = (link: string) => {
  if (window.api && window.api.openFolder) {
    window.api.openFolder(link)
  }
}

const getCategoryClass = (cat: string) => {
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
  <div class="library-view h-full flex flex-col gap-6">
    <div class="download-section flex flex-col gap-2">
      <el-button
        type="primary"
        :icon="Download"
        :disabled="isMetadataDownloaded"
        :loading="downloading"
        size="large"
        class="w-full"
        @click="handleDownloadMetadata"
      >
        {{ isMetadataDownloaded ? 'Metadata Database Ready' : 'Download metadata.json' }}
      </el-button>
      <div v-if="downloading" class="mt-2">
        <div class="flex justify-between text-xs mb-1 text-eh-muted">
          <span>Downloading gdata.json from MEGA...</span>
          <span>{{ downloadProgress }}%</span>
        </div>
        <el-progress :percentage="downloadProgress" :show-text="false" :stroke-width="10" striped />
      </div>
    </div>

    <div style="position: relative;">
      <el-card :class="{ 'opacity-50 grayscale select-none': !isMetadataDownloaded }">
        <template #header>
          <div class="flex items-center gap-4">
            <el-input
              v-model="searchTag"
              placeholder="language:chinese tag:color ..."
              class="flex-1"
              @keyup.enter="handleSearch"
            >
              <template #append>
                <el-button :icon="Search" @click="handleSearch">Search</el-button>
              </template>
            </el-input>
          </div>
        </template>
        <div class="flex items-center gap-6 text-sm text-eh-muted">
          <el-checkbox v-model="expunged" label="Expunged" />
          <div class="flex items-center gap-2">
            <span>Rating > </span>
            <el-rate v-model="ratings" />
          </div>
        </div>
      </el-card>
      <!-- Blocking Overlay using explicit styles -->
      <div
        v-if="!isMetadataDownloaded"
        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1000; cursor: not-allowed; background: rgba(0, 0, 0, 0.05); backdrop-filter: grayscale(1);"
        @click.stop.prevent
        @mousedown.stop.prevent
        @mouseup.stop.prevent
        @keydown.stop.prevent
        @contextmenu.stop.prevent
      ></div>
    </div>

    <div v-if="!isMetadataDownloaded" class="flex-1 flex flex-col items-center justify-center text-eh-muted bg-eh-panel rounded-lg border border-dashed border-eh-border">
      <el-icon size="48" class="mb-4"><Download /></el-icon>
      <p>Metadata Database is required for Library functionality.</p>
      <p class="text-sm">Click the button above to download it (approx. 200MB).</p>
    </div>

    <div v-else class="gallery-grid flex-1 overflow-y-auto pr-2">
      <div class="flex flex-col gap-3">
        <div
          v-for="g in downloadStore.libraryGalleries"
          :key="g.gid || g.link"
          class="eh-panel-card flex overflow-hidden hover:border-eh-accent transition-colors cursor-pointer"
          @click="handleOpenLink(g.link)"
        >
          <!-- Thumbnail Section -->
          <div
            class="w-[120px] aspect-[2/3] bg-eh-panel border-r border-eh-border flex items-center justify-center text-eh-muted shrink-0 overflow-hidden"
          >
            <img v-if="g.thumb" :src="g.thumb" class="w-full h-full object-cover" />
            <span v-else class="text-[10px] text-center px-1">[ No Thumb ]</span>
          </div>

          <!-- Metadata Section -->
          <div class="flex-1 p-3 flex flex-col gap-2">
            <div class="flex items-start justify-between gap-4">
              <span
                class="font-bold text-eh-text hover:underline text-sm leading-tight line-clamp-2"
                >{{ g.title }}</span
              >
              <div class="cat-badge shrink-0" :class="getCategoryClass(g.category)">
                {{ g.category || 'Unknown' }}
              </div>
            </div>

            <div class="flex flex-wrap gap-1 mt-1">
              <span
                v-if="g.language"
                class="text-[10px] px-1 bg-eh-sidebar border border-eh-border rounded-sm text-eh-muted"
              >
                {{ g.language }}
              </span>
              <span
                v-for="tag in (g.tags || []).slice(0, 5)"
                :key="tag"
                class="text-[10px] px-1 bg-eh-sidebar border border-eh-border rounded-sm text-eh-muted"
              >
                {{ tag }}
              </span>
              <span v-if="(g.tags || []).length > 5" class="text-[10px] text-eh-muted"
                >...</span
              >
            </div>

            <div
              class="flex items-center justify-between text-[11px] text-eh-muted mt-auto"
            >
              <div class="flex items-center gap-2">
                <el-rate :modelValue="Number(g.rating) || 0" disabled size="small" />
                <span>{{ g.rating }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span v-if="g.uploader" class="italic">{{ g.uploader }}</span>
                <span class="font-mono">{{ formatPosted(g.posted) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="downloadStore.libraryGalleries.length === 0"
          class="text-center py-20 text-eh-muted"
        >
          <p>No galleries found. Ensure "Metadata DB Path" is correct in Settings.</p>
        </div>
      </div>
    </div>

    <div class="flex justify-center p-4">
      <el-pagination
        layout="prev, pager, next"
        :total="downloadStore.libraryGalleries.length"
        :pageSize="100"
      />
    </div>
  </div>
</template>

<style scoped>
:deep(.el-rate) {
  --el-rate-fill-color: #ffae00;
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  /* stylelint-disable-next-line value-no-vendor-prefix */
  -webkit-box-orient: vertical;
  line-clamp: 2;
  overflow: hidden;
}
</style>
