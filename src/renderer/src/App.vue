<script setup lang="ts">
import { ref, onMounted, toRaw } from "vue";
import { useAppStore } from "./stores/app";
import { ElMessage } from "element-plus";
import {
  Monitor,
  Setting,
  Document,
  VideoPlay,
  FolderOpened,
  Search,
  Connection,
  Loading,
  CaretRight,
} from "@element-plus/icons-vue";

const store = useAppStore();
const activeTab = ref("dashboard");
const searchQuery = ref("");
const searchResults = ref<{ title: string; link: string }[]>([]);

// Download Favorites
const outputPattern = ref("./output/{execute_started_at}_FavoriteList.csv");

// Metadata Mapping
const mapKeywords = ref(
  "(C71) [Arisan-Antenna (Koari)] Eat The Rich! (Sukatto Golf Pangya)"
);
const mapMetadataPath = ref("metadata.json");
const mapFields = ref(["title", "link"]);
const mapResults = ref<any[]>([]);
const mapLoading = ref(false);

onMounted(() => {
  // Listen to sidecar events
  window.api.onLog((log: any) => {
    store.addLog(log);
  });

  window.api.onProgress((data: any) => {
    store.updateProgress(data);
  });

  window.api.onTaskComplete((data: any) => {
    store.setTaskComplete(data);
    ElMessage.success(`Task completed: ${data.count} items found`);
  });
});

const startTask = async () => {
  // Auto save config when starting task if cookies changed
  await window.api.saveConfig({ ...store.config });

  store.task.status = "running";
  store.task.progress = 0;
  store.task.message = "Detecting total pages...";

  try {
    const pageRes = await window.api.getFavoritesPages();
    if (!pageRes || pageRes.error || typeof pageRes.pages !== "number") {
      throw new Error(pageRes?.error || "Failed to detect total pages");
    }

    const totalPages = pageRes.pages;
    store.addLog({
      level: "info",
      message: `Total pages detected: ${totalPages}`,
    });

    const allResults: any[] = [];

    for (let p = 0; p < totalPages; p++) {
      if (store.task.status !== "running") {
        store.addLog({ level: "warn", message: "Task stopped by user." });
        break;
      }

      store.task.message = `Fetching page ${p + 1} of ${totalPages}...`;
      store.task.progress = Math.floor((p / totalPages) * 100);

      const res = await window.api.fetchFavoritesPage(p);
      if (res && res.items) {
        allResults.push(...res.items);
        store.addLog({
          level: "info",
          message: `Page ${p} fetched: ${res.items.length} items.`,
        });
      } else {
        store.addLog({
          level: "error",
          message: `Failed to fetch page ${p}: ${res?.error || "Unknown error"}`,
        });
      }

      // Optional: Add a small delay between requests to be gentle
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (store.task.status === "running") {
      store.task.message = "Saving results...";
      const saveRes = await window.api.saveFavoritesCSV({
        path: outputPattern.value,
        results: allResults,
      });

      if (saveRes && saveRes.status === "saved") {
        store.setTaskComplete({
          count: allResults.length,
          results: allResults,
        });
        store.addLog({
          level: "info",
          message: `Task complete. Saved to ${saveRes.path}`,
        });
      } else {
        throw new Error(saveRes?.error || "Failed to save CSV");
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || "Task failed");
    store.setTaskError(error.message || "Unknown error");
  }
};

const stopTask = async () => {
  store.task.status = "idle";
  store.task.message = "Stopping...";
  await window.api.stopFavoritesTask(); // Optional fallback
  store.task.message = "Terminated by user";
  ElMessage.warning("Task stopped");
};

const handleMetadataMap = async () => {
  if (!mapKeywords.value.trim()) {
    ElMessage.warning("Please enter at least one keyword");
    return;
  }
  mapLoading.value = true;
  try {
    const keywords = mapKeywords.value
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k);
    const res = await window.api.mapMetadata({
      keywords,
      metadata_path: toRaw(mapMetadataPath.value),
      fields: toRaw(mapFields.value),
    });

    if (res && res.results) {
      mapResults.value = res.results;
      ElMessage.success(`Mapped ${res.results.length} results`);
    } else if (res && res.error) {
      ElMessage.error(res.error);
    }
  } catch (error: any) {
    ElMessage.error(error.message || "Request failed");
  } finally {
    mapLoading.value = false;
  }
};

const saveConfig = async () => {
  const res = await window.api.saveConfig({ ...store.config });
  if (res.success) {
    ElMessage.success("Configuration saved");
  } else {
    ElMessage.error(res.error || "Unknown error");
  }
};

const handleSearch = async () => {
  if (!searchQuery.value) return;
  const res = await window.api.searchMetadata(searchQuery.value);
  if (res && res.results) {
    searchResults.value = res.results;
  }
};

const selectDownloadDir = async () => {
  const path = await window.api.selectDirectory();
  if (path) {
    store.config.download_path = path;
  }
};

const openDownloadDir = () => {
  window.api.openFolder(store.config.download_path);
};

const openLink = (url: string) => {
  window.electron.ipcRenderer.send("open-external", url);
};
</script>

<template>
  <div class="h-screen w-screen flex bg-bg-dark text-text-main overflow-hidden">
    <el-container class="h-full">
      <!-- Sidebar -->
      <el-aside
        width="240px"
        class="bg-bg-sidebar border-r border-glass-border flex flex-col"
      >
        <div class="p-7 px-6 flex items-center gap-3">
          <div
            class="w-8 h-8 bg-gradient-to-br from-primary to-purple-500 rounded-lg flex items-center justify-center font-bold text-white"
          >
            Eh
          </div>
          <span class="text-xl font-bold tracking-tight">Link Getter</span>
        </div>

        <el-menu
          :default-active="activeTab"
          class="!bg-transparent !border-r-0 flex-1"
          @select="(key: string) => (activeTab = key)"
        >
          <el-menu-item
            index="dashboard"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg !text-text-muted hover:!bg-glass-bg [&.is-active]:!bg-glass-bg [&.is-active]:!text-primary"
          >
            <el-icon><Monitor /></el-icon>
            <span>Console</span>
          </el-menu-item>
          <el-menu-item
            index="mapping"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg !text-text-muted hover:!bg-glass-bg [&.is-active]:!bg-glass-bg [&.is-active]:!text-primary"
          >
            <el-icon><Connection /></el-icon>
            <span>Mapping Metadata</span>
          </el-menu-item>
          <el-menu-item
            index="search"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg !text-text-muted hover:!bg-glass-bg [&.is-active]:!bg-glass-bg [&.is-active]:!text-primary"
          >
            <el-icon><Search /></el-icon>
            <span>Search Metadata</span>
          </el-menu-item>
          <el-menu-item
            index="logs"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg !text-text-muted hover:!bg-glass-bg [&.is-active]:!bg-glass-bg [&.is-active]:!text-primary"
          >
            <el-icon><Document /></el-icon>
            <span>Logs</span>
          </el-menu-item>
          <el-menu-item
            index="settings"
            class="!h-[50px] !m-1 !mx-3 !rounded-lg !text-text-muted hover:!bg-glass-bg [&.is-active]:!bg-glass-bg [&.is-active]:!text-primary"
          >
            <el-icon><Setting /></el-icon>
            <span>Settings</span>
          </el-menu-item>
        </el-menu>

        <div class="p-5 border-t border-glass-border">
          <div
            class="flex items-center gap-2 text-[0.8rem] text-text-muted"
            :class="store.task.status"
          >
            <div
              class="w-2 h-2 rounded-full"
              :class="
                store.task.status === 'running'
                  ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6] animate-pulse-custom'
                  : 'bg-emerald-500 shadow-[0_0_10px_#10b981]'
              "
            ></div>
            <span>Sidecar: Online</span>
          </div>
        </div>
      </el-aside>

      <!-- Main Content -->
      <el-main
        class="p-10 flex-1 relative bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.05),transparent_400px),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.05),transparent_400px)]"
      >
        <div v-if="activeTab === 'dashboard'" class="tab-pane">
          <div class="mb-8">
            <h1
              class="text-[2rem] font-extrabold m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
            >
              Task Console
            </h1>
            <p class="text-text-muted mt-2">Management and download control</p>
          </div>

          <el-card class="glass-card !p-2.5">
            <div class="flex justify-between items-center gap-10">
              <div class="flex-2">
                <div class="flex items-center gap-3 mb-2">
                  <h3 class="m-0 text-white">Download Favorites</h3>
                  <el-icon
                    v-if="store.task.status === 'running'"
                    class="is-loading text-primary text-2xl"
                  >
                    <Loading />
                  </el-icon>
                </div>
                <p class="text-text-muted">
                  Fetch all items from your E-Hentai favorites list.
                </p>

                <div class="my-4">
                  <span class="text-[0.85rem] text-text-muted"
                    >Cookies (raw string):</span
                  >
                  <el-input
                    v-model="store.config.cookies"
                    type="textarea"
                    :rows="3"
                    placeholder="ipb_member_id=...; ipb_pass_hash=...;"
                    size="small"
                    class="mt-2"
                  />
                </div>

                <div class="my-4 flex items-center gap-3">
                  <span class="text-[0.85rem] text-text-muted whitespace-nowrap"
                    >Output Path Pattern:</span
                  >
                  <el-input
                    v-model="outputPattern"
                    placeholder="./output/{execute_started_at}_FavoriteList.csv"
                    size="small"
                    class="max-w-[400px]"
                  />
                </div>

                <div v-if="store.task.status !== 'idle'" class="mt-5 w-[400px]">
                  <div
                    class="flex justify-between mb-2 text-[0.85rem] text-text-muted"
                  >
                    <span>{{ store.task.message }}</span>
                    <span>{{ store.task.progress }}%</span>
                  </div>
                  <el-progress
                    :percentage="store.task.progress"
                    :status="
                      store.task.status === 'error'
                        ? 'exception'
                        : store.task.status === 'completed'
                          ? 'success'
                          : ''
                    "
                    :indeterminate="
                      store.task.status === 'running' &&
                      store.task.progress === 0
                    "
                  />
                </div>
              </div>
              <div class="flex-1">
                <el-button
                  v-if="store.task.status === 'running'"
                  type="danger"
                  size="large"
                  @click="stopTask"
                  class="!h-[50px] !px-7 !font-semibold !rounded-xl transition-transform hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-10px_#f87171]"
                >
                  Stop Task
                </el-button>
                <el-button
                  v-else
                  type="primary"
                  size="large"
                  @click="startTask"
                  class="!h-[50px] !px-7 !font-semibold !rounded-xl !bg-gradient-to-br !from-indigo-500 !to-indigo-600 !border-none transition-transform hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-10px_#6366f1]"
                >
                  <el-icon><VideoPlay /></el-icon>
                  Start Task
                </el-button>
              </div>
            </div>
          </el-card>

          <div class="mt-10" v-if="store.results.length > 0">
            <h3 class="mb-4">Recent Results</h3>
            <el-table
              :data="store.results"
              style="width: 100%"
              height="300"
              class="glass-table"
            >
              <el-table-column
                prop="title"
                label="Title"
                show-overflow-tooltip
              />
              <el-table-column label="Action" width="120">
                <template #default="scope">
                  <el-button
                    link
                    type="primary"
                    @click="openLink(scope.row.link)"
                    >View</el-button
                  >
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <div v-if="activeTab === 'mapping'" class="tab-pane">
          <div class="mb-8">
            <h1
              class="text-[2rem] font-extrabold m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
            >
              Mapping Metadata
            </h1>
            <p class="text-text-muted mt-2">
              Bulk find links by title keywords
            </p>
          </div>

          <el-card class="glass-card !p-5">
            <el-form label-position="top">
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="Title Keywords (one per line)">
                    <el-input
                      v-model="mapKeywords"
                      type="textarea"
                      :rows="8"
                      placeholder="Input titles here..."
                    />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="Metadata JSON Path">
                    <el-input
                      v-model="mapMetadataPath"
                      placeholder="metadata.json"
                    />
                  </el-form-item>
                  <el-form-item label="Output Fields">
                    <el-select
                      v-model="mapFields"
                      multiple
                      placeholder="Select fields"
                      style="width: 100%"
                    >
                      <el-option label="Title" value="title" />
                      <el-option label="Link" value="link" />
                      <el-option label="GID" value="gid" />
                      <el-option label="Token" value="token" />
                    </el-select>
                  </el-form-item>
                  <div class="mt-5 flex justify-end">
                    <el-button
                      type="primary"
                      size="large"
                      :loading="mapLoading"
                      @click="handleMetadataMap"
                      icon="CaretRight"
                      >Start Mapping</el-button
                    >
                  </div>
                </el-col>
              </el-row>
            </el-form>
          </el-card>

          <div class="mt-10" v-if="mapResults.length > 0">
            <div class="flex justify-between items-center mb-4">
              <h3 class="m-0">Mapping Results ({{ mapResults.length }})</h3>
              <el-button size="small" @click="mapResults = []">Clear</el-button>
            </div>
            <el-table
              :data="mapResults"
              style="width: 100%"
              height="400"
              class="glass-table"
            >
              <el-table-column
                v-for="field in mapFields"
                :key="field"
                :prop="field"
                :label="field"
                show-overflow-tooltip
              >
                <template #default="scope">
                  <el-link
                    v-if="field === 'link'"
                    type="primary"
                    @click="openLink(scope.row[field])"
                  >
                    {{ scope.row[field] }}
                  </el-link>
                  <span v-else>{{ scope.row[field] }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <div v-if="activeTab === 'search'" class="tab-pane">
          <div class="mb-8">
            <h1
              class="text-[2rem] font-extrabold m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
            >
              Search Metadata
            </h1>
            <p class="text-text-muted mt-2">
              Deep search in local metadata index
            </p>
          </div>

          <el-card class="glass-card mb-6">
            <el-input
              v-model="searchQuery"
              placeholder="Enter search keywords..."
              class="!bg-black/5"
              @keyup.enter="handleSearch"
            >
              <template #prefix
                ><el-icon><Search /></el-icon
              ></template>
              <template #append
                ><el-button @click="handleSearch">Search</el-button></template
              >
            </el-input>
          </el-card>

          <div
            class="mt-5 flex flex-col gap-3 max-h-[500px] overflow-y-auto"
            v-if="searchResults.length > 0"
          >
            <el-card
              v-for="(item, idx) in searchResults"
              :key="idx"
              class="glass-card !p-4 flex justify-between items-center"
            >
              <div class="flex-1">
                <div class="font-semibold mb-1">{{ item.title }}</div>
                <div class="text-[0.8rem] text-text-muted">{{ item.link }}</div>
              </div>
              <el-button
                type="primary"
                plain
                size="small"
                @click="openLink(item.link)"
                >Open</el-button
              >
            </el-card>
          </div>
          <el-empty v-else-if="searchQuery" description="No results found" />
        </div>

        <div
          v-if="activeTab === 'logs'"
          class="tab-pane flex flex-col h-full overflow-hidden"
        >
          <div class="mb-8">
            <h1
              class="text-[2rem] font-extrabold m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
            >
              System Logs
            </h1>
            <p class="text-text-muted mt-2">Real-time sidecar output</p>
          </div>
          <div
            class="flex-1 flex flex-col overflow-hidden h-[500px] glass-card"
          >
            <div
              class="p-3 px-5 border-b border-glass-border flex justify-between items-center font-semibold text-[0.9rem]"
            >
              <span>Output Console</span>
              <el-button link @click="store.logs = []">Clear</el-button>
            </div>
            <div
              class="p-5 flex-1 overflow-y-auto font-mono text-[0.85rem] bg-black/20"
            >
              <div
                v-for="(log, idx) in store.logs"
                :key="idx"
                class="mb-1 whitespace-pre-wrap"
                :class="
                  log.level === 'error'
                    ? 'text-red-400'
                    : log.level === 'warn'
                      ? 'text-amber-400'
                      : 'text-slate-400'
                "
              >
                <span class="text-slate-500 mr-2.5">[{{ log.timestamp }}]</span>
                <span>{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'settings'" class="tab-pane">
          <div class="mb-8">
            <h1
              class="text-[2rem] font-extrabold m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
            >
              Configuration
            </h1>
            <p class="text-text-muted mt-2">Setup your credentials and paths</p>
          </div>

          <el-form
            :model="store.config"
            label-position="top"
            class="max-w-[800px]"
          >
            <el-card class="glass-card mb-6">
              <template #header>
                <div class="flex items-center gap-2 font-semibold">
                  <el-icon><Connection /></el-icon>
                  <span>Network Configuration</span>
                </div>
              </template>
              <el-form-item label="Proxy (Optional)">
                <el-input
                  v-model="store.config.proxy"
                  placeholder="http://127.0.0.1:7890"
                />
              </el-form-item>
            </el-card>

            <div class="flex justify-start">
              <el-button
                type="primary"
                size="large"
                @click="saveConfig"
                class="w-[200px]"
                >Save Changes</el-button
              >
            </div>
          </el-form>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<style>
/* 
  Global Element Plus overrides that are easier to keep here 
  or in assets/tailwind.css. We'll keep some deep specificity fixers.
*/

.el-input__wrapper {
  @apply !bg-white/5 !shadow-none !border !border-glass-border !text-white;
}

.el-textarea__inner {
  @apply !bg-white/5 !shadow-none !border !border-glass-border !text-white;
}

.el-card__header {
  @apply !border-b-glass-border;
}

.el-select .el-input__wrapper {
  @apply !bg-white/5;
}

.el-tag {
  @apply !bg-indigo-500/20 !border-indigo-500/30 !text-indigo-300;
}

/* Custom scrollbar for webkit */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  @apply bg-white/10 rounded-full hover:bg-white/20;
}
</style>
