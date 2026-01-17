<script setup lang="ts">
import { ref } from "vue";
import { useAppStore } from "../stores/app";
import { ElMessage } from "element-plus";
import { Loading, FolderOpened, VideoPlay } from "@element-plus/icons-vue";

const store = useAppStore();

// Download Scraper
const pageUrl = ref("");
const outputPattern = ref("./output/{execute_started_at}_ScrapedList.csv");
const isRunning = ref(false);
const scrapedLinks = ref<string[]>([]);

const executeScrape = async (url: string, outputPath: string) => {
  isRunning.value = true;
  scrapedLinks.value = [];
  // Auto save config when starting task if cookies changed
  await window.api.saveConfig({ ...store.config });

  store.task.status = "running";
  store.task.progress = 0;
  store.task.message = "Initializing...";

  try {
    const allResults: any[] = [];
    let nextToken: string | undefined = undefined;
    let pagesFetched = 0;
    let hasMore = true;

    while (hasMore) {
      if (store.task.status !== "running") {
        store.addLog({ level: "warn", message: "Task stopped by user." });
        break;
      }

      store.task.message = `Fetching page ${pagesFetched + 1}...`;
      store.task.progress = (pagesFetched * 5) % 100;

      const res = await window.api.fetchPage({ url, next: nextToken });
      if (res && res.items) {
        allResults.push(...res.items);
        // 更新預覽連結
        res.items.forEach((item: any) => {
          if (item.link) {
            scrapedLinks.value.push(item.link);
          } else {
            console.warn("Item found without link property:", item);
          }
        });

        store.addLog({
          level: "info",
          message: `Fetched ${res.items.length} links from page ${pagesFetched + 1}. Total links: ${scrapedLinks.value.length}`,
        });

        nextToken = res.next;
        hasMore = !!nextToken;
        pagesFetched++;
        store.addLog({
          level: "info",
          message: `Fetched page ${pagesFetched}${nextToken ? ", next token found" : ", last page reached"}.`,
        });
      } else {
        const errMsg = res?.error || "Unknown error fetching page";
        store.addLog({ level: "error", message: errMsg });
        throw new Error(errMsg);
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    if (store.task.status === "running") {
      store.task.message = "Saving results...";
      const saveRes = await window.api.saveCSV({
        path: outputPath,
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
  } finally {
    isRunning.value = false;
  }
};

const startScrapeTask = () => {
  if (!pageUrl.value.trim()) {
    ElMessage.warning("Please enter a valid URL");
    return;
  }
  executeScrape(pageUrl.value, outputPattern.value);
};

const stopTask = async () => {
  store.task.status = "idle";
  store.task.message = "Stopping...";
  await window.api.stopTask(); // Optional fallback
  store.task.message = "Terminated by user";
  isRunning.value = false;
  ElMessage.warning("Task stopped");
};

const handleSelectOutputPath = async () => {
  const path = await window.api.selectSavePath();
  if (path) {
    outputPattern.value = path;
  }
};

const openLink = (url: string) => {
  window.electron.ipcRenderer.send("open-external", url);
};
</script>

<template>
  <div class="tab-pane">
    <div class="mb-8">
      <h1
        class="text-[2rem] font-extrabold m-0 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent"
      >
        Task Console
      </h1>
      <p class="text-text-muted mt-2">Management and download control</p>
    </div>

    <!-- Download Page Panel -->
    <el-card class="glass-card !p-2.5 mb-6">
      <div class="flex justify-between items-center gap-10">
        <div class="flex-2">
          <div class="flex items-center gap-3 mb-2">
            <h3 class="m-0 text-white font-bold">Download Page</h3>
            <el-icon v-if="isRunning" class="is-loading text-primary text-2xl">
              <Loading />
            </el-icon>
          </div>
          <p class="text-text-muted mb-4">
            Scrape any gallery list URL (e.g., search results or tag lists).
          </p>

          <div class="my-4">
            <div class="flex justify-between items-center">
              <span class="text-[0.85rem] text-text-muted">Target URL:</span>
              <div class="flex gap-2">
                <el-button
                  size="small"
                  link
                  class="!text-primary italic hover:underline"
                  @click="pageUrl = 'https://e-hentai.org/favorites.php'"
                >
                  favorite
                </el-button>
                <el-button
                  size="small"
                  link
                  class="!text-primary italic hover:underline"
                  @click="pageUrl = 'https://e-hentai.org/'"
                >
                  home
                </el-button>
              </div>
            </div>
            <el-input
              v-model="pageUrl"
              placeholder="https://e-hentai.org/?f_cats=96"
              size="small"
              class="mt-2"
            />
          </div>

          <div class="my-4">
            <span class="text-[0.85rem] text-text-muted"
              >Cookies (JSON Format):</span
            >
            <el-input
              v-model="store.config.cookies"
              type="textarea"
              :rows="3"
              placeholder='[{"domain": ".e-hentai.org", "name": "ipb_member_id", "value": "..."}]'
              class="mt-2"
            />
          </div>

          <div class="my-4 flex items-center gap-3">
            <span class="text-[0.85rem] text-text-muted whitespace-nowrap">
              Output Path Pattern:
            </span>
            <div class="flex flex-1 gap-2">
              <el-input
                v-model="outputPattern"
                placeholder="./output/{execute_started_at}_ScrapedList.csv"
                size="small"
              />
              <el-button
                size="small"
                :icon="FolderOpened"
                @click="handleSelectOutputPath"
              />
            </div>
          </div>
        </div>
        <div class="flex-1 text-right">
          <el-button
            v-if="isRunning"
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
            @click="startScrapeTask"
            class="!h-[50px] !px-7 !font-semibold !rounded-xl !bg-gradient-to-br !from-purple-500 !to-purple-600 !border-none transition-transform hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-10px_#a855f7]"
          >
            <el-icon><VideoPlay /></el-icon>
            Scrape URL
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- Output Console -->
    <div class="mt-8 flex flex-col glass-card max-h-[400px]">
      <div
        class="p-3 px-5 border-b border-glass-border flex justify-between items-center font-semibold text-[0.9rem]"
      >
        <span>Output Console (Scraped Links)</span>
        <el-button link @click="scrapedLinks = []">Clear</el-button>
      </div>
      <div
        class="p-5 flex-1 overflow-y-auto font-mono text-[0.85rem] bg-black/20 min-h-[150px]"
      >
        <div v-if="scrapedLinks.length === 0" class="text-slate-600 italic">
          No links captured yet...
        </div>
        <div
          v-for="(link, idx) in scrapedLinks"
          :key="idx"
          class="mb-1 text-slate-400 break-all"
        >
          <span class="text-slate-500 mr-2">[{{ idx + 1 }}]</span>
          <span
            class="cursor-pointer hover:text-primary"
            @click="openLink(link)"
          >
            {{ link }}
          </span>
        </div>
      </div>
    </div>

    <!-- Shared Status Display -->
    <div
      v-if="store.task.status !== 'idle'"
      class="mt-8 mb-4 p-4 rounded-xl bg-glass-bg border border-glass-border"
    >
      <div class="flex items-center gap-4">
        <span class="text-[0.95rem] font-medium text-white">{{
          store.task.message
        }}</span>
        <el-tag
          v-if="store.task.status === 'completed'"
          type="success"
          effect="dark"
          class="!bg-emerald-500/20 !text-emerald-400 !border-emerald-500/30 !px-4 font-bold tracking-wider"
        >
          DONE
        </el-tag>
        <el-tag
          v-if="store.task.status === 'error'"
          type="danger"
          effect="dark"
          class="!bg-red-500/20 !text-red-400 !border-red-500/30 !px-4 font-bold"
        >
          ERROR
        </el-tag>
      </div>
    </div>

    <div class="mt-10" v-if="store.results.length > 0">
      <h3 class="mb-4">Recent Results</h3>
      <el-table
        :data="store.results"
        style="width: 100%"
        height="300"
        class="glass-table"
      >
        <el-table-column prop="title" label="Title" show-overflow-tooltip />
        <el-table-column label="Action" width="120">
          <template #default="scope">
            <el-button link type="primary" @click="openLink(scope.row.link)"
              >View</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>
