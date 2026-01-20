<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { Folder, Delete, Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useScraperStore } from "../../stores/scraper";
import { useDownloadStore } from "../../stores/download";
import { useConfigStore } from "../../stores/config";
import { storeToRefs } from "pinia";

const scraperStore = useScraperStore();
const downloadStore = useDownloadStore();
const configStore = useConfigStore();
const { draftGalleries } = storeToRefs(scraperStore);

interface DraftGallery {
  id: string;
  title: string;
  link: string;
}

const targetPath = ref("");
const useZip = ref(true);
const zipPass = ref("");
const manualUrl = ref("");

// Pagination state
const currentPage = ref(1);
const pageSize = ref(20);

// Filter state
const searchQuery = ref("");

// Tab state for selecting all
const selectedIds = ref<Set<string>>(new Set());

const isGallerySelected = (id: string) => selectedIds.value.has(id);

const toggleGallery = (id: string) => {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id);
  } else {
    selectedIds.value.add(id);
  }
};

const isAllSelected = computed(() => {
  return (
    filteredGalleries.value.length > 0 &&
    filteredGalleries.value.every((g: DraftGallery) =>
      selectedIds.value.has(g.id),
    )
  );
});

const isIndeterminate = computed(() => {
  const selectedInFiltered = filteredGalleries.value.filter((g: DraftGallery) =>
    selectedIds.value.has(g.id),
  ).length;
  return (
    selectedInFiltered > 0 &&
    selectedInFiltered < filteredGalleries.value.length
  );
});

const toggleSelectAll = (val: boolean) => {
  if (val) {
    filteredGalleries.value.forEach((g: DraftGallery) =>
      selectedIds.value.add(g.id),
    );
  } else {
    filteredGalleries.value.forEach((g: DraftGallery) =>
      selectedIds.value.delete(g.id),
    );
  }
};

// Filter Computed
const filteredGalleries = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return draftGalleries.value;
  return draftGalleries.value.filter(
    (g: DraftGallery) =>
      g.title.toLowerCase().includes(query) ||
      g.link.toLowerCase().includes(query),
  );
});

// Pagination Computed
const paginatedGalleries = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredGalleries.value.slice(start, end);
});

const isPageSelected = computed(() => {
  if (paginatedGalleries.value.length === 0) return false;
  return paginatedGalleries.value.every((g: DraftGallery) =>
    selectedIds.value.has(g.id),
  );
});

const isPageIndeterminate = computed(() => {
  const pageSelectedCount = paginatedGalleries.value.filter((g: DraftGallery) =>
    selectedIds.value.has(g.id),
  ).length;
  return (
    pageSelectedCount > 0 && pageSelectedCount < paginatedGalleries.value.length
  );
});

const toggleSelectPage = (val: boolean) => {
  if (val) {
    paginatedGalleries.value.forEach((g: DraftGallery) =>
      selectedIds.value.add(g.id),
    );
  } else {
    paginatedGalleries.value.forEach((g: DraftGallery) =>
      selectedIds.value.delete(g.id),
    );
  }
};

const handleAddManual = () => {
  try {
    if (!manualUrl.value) return;
    scraperStore.addGalleryToDraft(manualUrl.value);
    manualUrl.value = "";
    ElMessage.success("Gallery added to draft");
  } catch (error: any) {
    ElMessage.error(error.message);
  }
};

const handleBrowse = async () => {
  try {
    const result = await window.api.selectDirectory();
    if (result) {
      targetPath.value = result;
    }
  } catch (error) {
    ElMessage.error("Failed to select folder");
  }
};

const handlePlaceholder = (placeholder: string) => {
  targetPath.value = (targetPath.value || "") + placeholder;
};

const handleAddSelectedToQueue = async () => {
  if (selectedIds.value.size === 0) {
    ElMessage.warning("No galleries selected");
    return;
  }

  const selectedGalleriesList = draftGalleries.value.filter((g) =>
    selectedIds.value.has(g.id),
  );

  // Group into a single job or separate?
  // For Draft list, users might expect them to be added together.
  const jobId = `draft-${Date.now()}`;
  downloadStore.addToQueue(
    jobId,
    "Draft Selection",
    selectedGalleriesList,
    useZip.value,
    zipPass.value,
  );

  // Remove from drafts
  selectedGalleriesList.forEach((g) => {
    scraperStore.removeGalleryFromDraft(g.id);
  });

  selectedIds.value.clear();
  ElMessage.success(
    `Added ${selectedGalleriesList.length} galleries to download queue`,
  );
};

const handleDeleteGallery = (id: string) => {
  scraperStore.removeGalleryFromDraft(id);
  selectedIds.value.delete(id);
  // Adjust page if current page became empty
  if (paginatedGalleries.value.length === 0 && currentPage.value > 1) {
    currentPage.value--;
  }
};

// Update config when target path changes
watch(targetPath, (val) => configStore.updateConfig({ download_path: val }));

// Reset page when filter changes
watch(searchQuery, () => {
  currentPage.value = 1;
});

// Initialize default download path
onMounted(async () => {
  if (!targetPath.value || targetPath.value.trim() === "") {
    try {
      const defaultPath = await window.api.getDownloadsPath();
      if (defaultPath) {
        targetPath.value = defaultPath + "/{EN_TITLE}";
      }
    } catch (error) {
      console.error("Failed to get default downloads path:", error);
    }
  }
});
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full overflow-hidden">
    <!-- Manual Add Panel -->
    <div class="eh-panel-card">
      <div class="eh-header">Add Gallery Link</div>
      <div class="p-4 flex gap-2">
        <el-input
          v-model="manualUrl"
          placeholder="https://e-hentai.org/g/XXXXX/XXXXXX/"
          @keyup.enter="handleAddManual"
        />
        <el-button type="primary" :icon="Plus" @click="handleAddManual"
          >Add</el-button
        >
      </div>
    </div>

    <!-- Draft List Panel -->
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header flex justify-between items-center">
        <span>Ready to Download (Draft List)</span>
        <div
          class="flex items-center gap-4"
          v-if="filteredGalleries.length > 0"
        >
          <div class="flex items-center gap-2">
            <el-checkbox
              :model-value="isPageSelected"
              :indeterminate="isPageIndeterminate"
              @change="toggleSelectPage"
              class="!mr-0"
            />
            <span class="text-[10px] uppercase font-bold text-eh-accent"
              >Select Page</span
            >
          </div>
          <div class="flex items-center gap-2">
            <el-checkbox
              :model-value="isAllSelected"
              :indeterminate="isIndeterminate"
              @change="toggleSelectAll"
              class="!mr-0"
            />
            <span class="text-[10px] uppercase font-bold text-eh-accent"
              >Select Filtered</span
            >
          </div>
        </div>
      </div>

      <!-- Filter Input -->
      <div class="px-4 py-2 border-b border-eh-border/50 bg-eh-panel/5">
        <el-input
          v-model="searchQuery"
          placeholder="Filter by title or link..."
          size="small"
          clearable
        />
      </div>

      <div class="p-4 flex-1 overflow-y-auto bg-white/30">
        <div class="flex flex-col gap-2">
          <div
            v-for="g in paginatedGalleries"
            :key="g.id"
            class="flex items-center gap-3 p-2 bg-eh-panel/20 border-l-4"
            :class="
              isGallerySelected(g.id)
                ? 'border-eh-accent bg-eh-panel/40'
                : 'border-eh-border'
            "
          >
            <el-checkbox
              :model-value="isGallerySelected(g.id)"
              @change="toggleGallery(g.id)"
            />
            <div class="flex-1 min-w-0">
              <div
                class="text-[12px] font-bold truncate"
                :class="!isGallerySelected(g.id) && 'text-eh-muted opacity-60'"
              >
                {{ g.title }}
              </div>
              <div class="text-[10px] text-eh-muted truncate opacity-70">
                {{ g.link }}
              </div>
            </div>
            <el-button
              type="danger"
              size="small"
              circle
              plain
              :icon="Delete"
              @click="handleDeleteGallery(g.id)"
            />
          </div>

          <div
            v-if="draftGalleries.length === 0"
            class="text-center py-10 text-eh-muted text-xs italic"
          >
            No drafts in the list. Start fetching or add links manually.
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="filteredGalleries.length > pageSize"
        class="p-2 border-t border-eh-border flex justify-center bg-eh-panel/10"
      >
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          layout="prev, pager, next"
          :total="filteredGalleries.length"
          small
        />
      </div>
    </div>

    <!-- Configuration Panel -->
    <div class="eh-panel-card">
      <div class="eh-header">Download Configuration</div>
      <div class="p-4 flex flex-col gap-4 text-xs">
        <div class="flex flex-col gap-2">
          <label class="text-[10px] text-eh-muted font-bold uppercase"
            >Target Path:</label
          >
          <div class="flex gap-2">
            <el-input v-model="targetPath" size="small" class="flex-1" />
            <el-button size="small" @click="handleBrowse">Browse</el-button>
          </div>
          <div class="flex gap-2 mt-1">
            <el-button
              size="small"
              plain
              @click="handlePlaceholder('{EN_TITLE}')"
              >{EN_TITLE}</el-button
            >
            <el-button size="small" plain @click="handlePlaceholder('{ID}')"
              >{ID}</el-button
            >
            <el-button
              size="small"
              plain
              @click="handlePlaceholder('{JP_TITLE}')"
              >{JP_TITLE}</el-button
            >
          </div>
        </div>

        <div class="flex items-center gap-4 mt-2">
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-eh-muted font-bold uppercase"
              >Zip:</span
            >
            <el-switch v-model="useZip" size="small" />
          </div>
          <div v-if="useZip" class="flex items-center gap-2 flex-1">
            <span class="text-[10px] text-eh-muted font-bold uppercase"
              >password:</span
            >
            <el-input
              v-model="zipPass"
              size="small"
              placeholder="Leave empty for no password"
              class="flex-1"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <el-button
        type="primary"
        class="w-full !rounded-none !h-10 font-bold uppercase tracking-widest"
        :disabled="selectedIds.size === 0"
        @click="handleAddSelectedToQueue"
      >
        Start Download ({{ selectedIds.size }} Selected)
      </el-button>
    </div>
  </div>
</template>

<style scoped>
/* Keep consistent transitions */
.eh-panel-card {
  transition: all 0.2s ease;
}
</style>

<style scoped>
.fetched-tasks-collapse :deep(.el-collapse-item) {
  @apply eh-panel-card !bg-eh-panel/50 mb-3;
}

.fetched-tasks-collapse :deep(.el-collapse-item__header) {
  @apply !bg-transparent !border-b-0 px-3 py-2;
}

.fetched-tasks-collapse :deep(.el-collapse-item__wrap) {
  @apply !bg-transparent !border-b-0;
}

.fetched-tasks-collapse :deep(.el-collapse-item__content) {
  @apply pb-3 px-3;
}

.fetched-tasks-collapse :deep(.el-collapse-item__arrow) {
  @apply text-eh-accent;
}
</style>
