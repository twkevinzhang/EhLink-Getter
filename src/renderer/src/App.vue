<script setup lang="ts">
import { ref, onMounted } from "vue";
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
} from "@element-plus/icons-vue";

const store = useAppStore();
const activeTab = ref("dashboard");
const searchQuery = ref("");
const searchResults = ref<{ title: string; link: string }[]>([]);

// Download Favorites
const outputPattern = ref("./output/{execute_started_at}_FavoriteList.csv");

// Metadata Mapping
const mapKeywords = ref("");
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
  const res = await window.api.startFavoritesTask(outputPattern.value);
  if (!res.success) {
    ElMessage.error(res.error || "Unknown error");
    store.setTaskError(res.error || "Unknown error");
  }
};

const stopTask = async () => {
  const res = await window.api.stopFavoritesTask();
  if (res.success) {
    ElMessage.warning("Termination signal sent.");
    store.task.status = "idle";
    store.task.message = "Terminated by user";
  } else {
    ElMessage.error(res.error || "Failed to stop task");
  }
};

const handleMetadataMap = async () => {
  if (!mapKeywords.value.trim()) {
    ElMessage.warning("Please enter at least one keyword");
    return;
  }
  mapLoading.value = true;
  const keywords = mapKeywords.value
    .split("\n")
    .map((k) => k.trim())
    .filter((k) => k);
  const res = await window.api.mapMetadata({
    keywords,
    metadata_path: mapMetadataPath.value,
    fields: mapFields.value,
  });

  if (res && res.results) {
    mapResults.value = res.results;
    ElMessage.success(`Mapped ${res.results.length} results`);
  } else if (res && res.error) {
    ElMessage.error(res.error);
  }
  mapLoading.value = false;
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
  <div class="app-container" :class="{ dark: true }">
    <el-container class="main-layout">
      <!-- Sidebar -->
      <el-aside width="240px" class="sidebar">
        <div class="logo-container">
          <div class="logo-icon">Eh</div>
          <span class="logo-text">Link Getter</span>
        </div>

        <el-menu
          :default-active="activeTab"
          class="sidebar-menu"
          @select="(key: string) => (activeTab = key)"
        >
          <el-menu-item index="dashboard">
            <el-icon><Monitor /></el-icon>
            <span>Console</span>
          </el-menu-item>
          <el-menu-item index="mapping">
            <el-icon><Connection /></el-icon>
            <span>Mapping Metadata</span>
          </el-menu-item>
          <el-menu-item index="search">
            <el-icon><Search /></el-icon>
            <span>Search Metadata</span>
          </el-menu-item>
          <el-menu-item index="logs">
            <el-icon><Document /></el-icon>
            <span>Logs</span>
          </el-menu-item>
          <el-menu-item index="settings">
            <el-icon><Setting /></el-icon>
            <span>Settings</span>
          </el-menu-item>
        </el-menu>

        <div class="sidebar-footer">
          <div class="status-indicator" :class="store.task.status">
            <div class="dot"></div>
            <span>Sidecar: Online</span>
          </div>
        </div>
      </el-aside>

      <!-- Main Content -->
      <el-main class="content-area">
        <div v-if="activeTab === 'dashboard'" class="tab-pane">
          <div class="header-section">
            <h1>Task Console</h1>
            <p class="subtitle">Management and download control</p>
          </div>

          <el-card class="glass-card main-action-card">
            <div class="action-grid">
              <div class="task-info">
                <div class="title-with-status">
                  <h3>Download Favorites</h3>
                  <el-icon
                    v-if="store.task.status === 'running'"
                    class="is-loading title-spinner"
                  >
                    <Loading />
                  </el-icon>
                </div>
                <p>Fetch all items from your E-Hentai favorites list.</p>

                <div class="auth-section">
                  <span class="input-label">Cookies (raw string):</span>
                  <el-input
                    v-model="store.config.cookies"
                    type="textarea"
                    :rows="3"
                    placeholder="ipb_member_id=...; ipb_pass_hash=...;"
                    size="small"
                    class="auth-input"
                  />
                </div>

                <div class="path-input-group">
                  <span class="input-label">Output Path Pattern:</span>
                  <el-input
                    v-model="outputPattern"
                    placeholder="./output/{execute_started_at}_FavoriteList.csv"
                    size="small"
                    class="path-input"
                  />
                </div>

                <div
                  v-if="store.task.status !== 'idle'"
                  class="progress-section"
                >
                  <div class="progress-text">
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
              <div class="btn-group">
                <el-button
                  v-if="store.task.status === 'running'"
                  type="danger"
                  size="large"
                  @click="stopTask"
                  class="stop-btn-toggle"
                >
                  Stop Task
                </el-button>
                <el-button
                  v-else
                  type="primary"
                  size="large"
                  @click="startTask"
                  class="start-btn"
                >
                  <el-icon><VideoPlay /></el-icon>
                  Start Task
                </el-button>
              </div>
            </div>
          </el-card>

          <div class="results-section" v-if="store.results.length > 0">
            <h3>Recent Results</h3>
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
          <div class="header-section">
            <h1>Mapping Metadata</h1>
            <p class="subtitle">Bulk find links by title keywords</p>
          </div>

          <el-card class="glass-card mapping-card">
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
                  <div class="mapping-actions">
                    <el-button
                      type="primary"
                      size="large"
                      :loading="mapLoading"
                      @click="handleMetadataMap"
                      icon="CaretRight"
                    >
                      Start Mapping
                    </el-button>
                  </div>
                </el-col>
              </el-row>
            </el-form>
          </el-card>

          <div class="results-section" v-if="mapResults.length > 0">
            <div class="section-header">
              <h3>Mapping Results ({{ mapResults.length }})</h3>
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
                <template #default="scope" v-if="field === 'link'">
                  <el-link type="primary" @click="openLink(scope.row[field])">{{
                    scope.row[field]
                  }}</el-link>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <div v-if="activeTab === 'search'" class="tab-pane">
          <div class="header-section">
            <h1>Search Metadata</h1>
            <p class="subtitle">Deep search in local metadata index</p>
          </div>

          <el-card class="glass-card search-card">
            <div class="search-input-wrapper">
              <el-input
                v-model="searchQuery"
                placeholder="Enter search keywords..."
                class="premium-input"
                @keyup.enter="handleSearch"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
                <template #append>
                  <el-button @click="handleSearch">Search</el-button>
                </template>
              </el-input>
            </div>
          </el-card>

          <div class="search-results-list" v-if="searchResults.length > 0">
            <el-card
              v-for="(item, idx) in searchResults"
              :key="idx"
              class="result-item-card glass-card"
            >
              <div class="result-content">
                <div class="title">{{ item.title }}</div>
                <div class="link">{{ item.link }}</div>
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

        <div v-if="activeTab === 'logs'" class="tab-pane full-height">
          <div class="header-section">
            <h1>System Logs</h1>
            <p class="subtitle">Real-time sidecar output</p>
          </div>
          <div class="log-container-wrapper glass-card">
            <div class="log-header">
              <span>Output Console</span>
              <el-button link @click="store.logs = []">Clear</el-button>
            </div>
            <div class="log-scroll">
              <div
                v-for="(log, idx) in store.logs"
                :key="idx"
                class="log-line"
                :class="log.level"
              >
                <span class="log-time">[{{ log.timestamp }}]</span>
                <span class="log-msg">{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'settings'" class="tab-pane">
          <div class="header-section">
            <h1>Configuration</h1>
            <p class="subtitle">Setup your credentials and paths</p>
          </div>

          <el-form
            :model="store.config"
            label-position="top"
            class="settings-form"
          >
            <el-card class="glass-card settings-group">
              <template #header>
                <div class="card-header">
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

            <div class="form-actions">
              <el-button
                type="primary"
                size="large"
                @click="saveConfig"
                class="save-btn"
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
:root {
  --primary-color: #6366f1;
  --bg-dark: #0f172a;
  --bg-sidebar: #1e293b;
  --glass-bg: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.1);
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
}

body {
  margin: 0;
  font-family:
    "Inter",
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    sans-serif;
  background-color: var(--bg-dark);
  color: var(--text-main);
  overflow: hidden;
}

.app-container {
  height: 100vh;
  width: 100vw;
  display: flex;
}

.main-layout {
  height: 100%;
}

.sidebar {
  background-color: var(--bg-sidebar);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
}

.logo-container {
  padding: 30px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: white;
}

.logo-text {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.025em;
}

.sidebar-menu {
  background: transparent !important;
  border-right: none !important;
  flex: 1;
}

.sidebar-menu .el-menu-item {
  height: 50px;
  margin: 4px 12px;
  border-radius: 8px;
  color: var(--text-muted) !important;
}

.sidebar-menu .el-menu-item.is-active {
  background: var(--glass-bg) !important;
  color: var(--primary-color) !important;
}

.sidebar-menu .el-menu-item:hover {
  background: var(--glass-bg) !important;
}

.sidebar-footer {
  padding: 20px;
  border-top: 1px solid var(--glass-border);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.status-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 10px #10b981;
}

.status-indicator.running .dot {
  background-color: #3b82f6;
  box-shadow: 0 0 10px #3b82f6;
  animation: pulse 1s infinite;
}

.content-area {
  padding: 40px;
  background:
    radial-gradient(
      circle at top right,
      rgba(99, 102, 241, 0.05),
      transparent 400px
    ),
    radial-gradient(
      circle at bottom left,
      rgba(168, 85, 247, 0.05),
      transparent 400px
    );
}

.header-section {
  margin-bottom: 30px;
}

h1 {
  font-size: 2rem;
  font-weight: 800;
  margin: 0;
  background: linear-gradient(to right, #fff, #94a3b8);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  color: var(--text-muted);
  margin: 8px 0 0 0;
}

.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  color: white;
}

.main-action-card {
  padding: 10px;
}

.action-grid {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-info h3 {
  margin: 0 0 8px 0;
}

.progress-section {
  margin-top: 20px;
  width: 400px;
}

.progress-text {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.start-btn {
  height: 50px;
  padding: 0 30px;
  font-weight: 600;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
  border: none !important;
  transition: transform 0.2s;
}

.start-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px -10px #6366f1;
}

.results-section {
  margin-top: 40px;
}

.glass-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(255, 255, 255, 0.03);
  --el-table-border-color: var(--glass-border);
  border-radius: 12px;
  overflow: hidden;
}

.log-container-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 500px;
}

.log-header {
  padding: 12px 20px;
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 0.9rem;
}

.log-scroll {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 0.85rem;
  background: rgba(0, 0, 0, 0.2);
}

.log-line {
  margin-bottom: 4px;
  white-space: pre-wrap;
}

.log-time {
  color: #64748b;
  margin-right: 10px;
}

.log-line.error .log-msg {
  color: #f87171;
}
.log-line.warn .log-msg {
  color: #fbbf24;
}
.log-line.info .log-msg {
  color: #94a3b8;
}

.search-results-list {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 500px;
  overflow-y: auto;
}

.result-item-card {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-content .title {
  font-weight: 600;
  margin-bottom: 4px;
}

.result-content .link {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.settings-form {
  max-width: 800px;
}

.settings-group {
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.save-btn {
  width: 200px;
}

.title-with-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.title-with-status h3 {
  margin: 0;
}

.title-spinner {
  font-size: 1.5rem;
  color: var(--primary-color);
}

.auth-section {
  margin: 15px 0;
}

.auth-input {
  margin-top: 8px;
}

.path-input-group {
  margin: 15px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.input-label {
  font-size: 0.85rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.path-input {
  max-width: 400px;
}

.btn-group {
  display: flex;
  gap: 12px;
}

.stop-btn-toggle {
  height: 50px;
  padding: 0 30px;
  font-weight: 600;
  border-radius: 12px;
  transition: transform 0.2s;
}

.stop-btn-toggle:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px -10px #f87171;
}

.stop-btn {
  height: 50px;
  border-radius: 12px;
}

.mapping-card {
  padding: 20px;
}

.mapping-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

/* Element Plus Overrides for Dark Mode */
.el-input__wrapper {
  background-color: rgba(255, 255, 255, 0.05) !important;
  box-shadow: 0 0 0 1px var(--glass-border) inset !important;
}

.el-textarea__inner {
  background-color: rgba(255, 255, 255, 0.05) !important;
  box-shadow: 0 0 0 1px var(--glass-border) inset !important;
  color: white !important;
}

.el-card__header {
  border-bottom: 1px solid var(--glass-border) !important;
}

.el-select .el-input__wrapper {
  background-color: rgba(255, 255, 255, 0.05) !important;
}

.el-tag {
  background-color: rgba(99, 102, 241, 0.2) !important;
  border-color: rgba(99, 102, 241, 0.3) !important;
  color: #a5b4fc !important;
}
</style>
