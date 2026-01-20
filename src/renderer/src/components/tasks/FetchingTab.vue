<script setup lang="ts">
import { useScraperStore } from "../../stores/scraper";
import { storeToRefs } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";

const scraperStore = useScraperStore();
const { activeFetchingJobs } = storeToRefs(scraperStore);

const handlePause = async (jobId: string) => {
  await scraperStore.pauseFetching(jobId);
  ElMessage.success("Task paused");
};

const handleResume = async (jobId: string) => {
  await scraperStore.resumeFetching(jobId);
  ElMessage.success("Task resumed");
};

const handleDelete = async (jobId: string) => {
  try {
    await ElMessageBox.confirm(
      "Are you sure you want to delete this task?",
      "Warning",
      {
        type: "warning",
      },
    );
    scraperStore.deleteFetchingJob(jobId);
    ElMessage.success("Task deleted");
  } catch (e) {
    // User cancelled dialog
  }
};

const getStateLabel = (state: string) => {
  switch (state) {
    case "waiting":
      return "等待中";
    case "fetching":
      return "爬取中";
    case "paused":
      return "已暫停";
    default:
      return state;
  }
};

const getStateColor = (state: string) => {
  switch (state) {
    case "waiting":
      return "text-gray-500";
    case "fetching":
      return "text-blue-600";
    case "paused":
      return "text-orange-500";
    default:
      return "text-gray-500";
  }
};
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full">
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header">Active Scraper Jobs</div>
      <div
        class="p-4 flex-1 overflow-y-auto flex flex-col gap-3 bg-eh-panel/30"
      >
        <div
          v-for="job in activeFetchingJobs"
          :key="job.id"
          class="eh-panel-card p-3 !bg-white/40"
        >
          <div class="flex flex-col gap-2">
            <!-- Header with state badge -->
            <div class="flex items-center justify-between">
              <div class="text-[11px] text-eh-muted truncate font-mono flex-1">
                {{ job.link }}
              </div>
              <span
                :class="[
                  'text-[10px] font-bold px-2 py-0.5 rounded',
                  getStateColor(job.state),
                ]"
              >
                {{ getStateLabel(job.state) }}
              </span>
            </div>

            <!-- Progress bar and status -->
            <div class="flex items-center gap-4">
              <el-progress :percentage="job.progress" class="flex-1" />
              <span
                class="text-[11px] w-32 text-right font-bold text-eh-text"
                >{{ job.status }}</span
              >
            </div>

            <!-- Stats -->
            <div class="flex gap-4 text-[10px] text-eh-muted">
              <span>頁數: {{ job.currentPage }}</span>
              <span>項目: {{ job.totalItems }}</span>
            </div>

            <!-- Action buttons -->
            <div class="flex gap-2 mt-2">
              <!-- Pause button (only when fetching) -->
              <el-button
                v-if="job.state === 'fetching'"
                @click="handlePause(job.id)"
                size="small"
                type="warning"
                plain
                class="flex-1"
              >
                暫停
              </el-button>

              <!-- Resume button (only when paused) -->
              <el-button
                v-if="job.state === 'paused'"
                @click="handleResume(job.id)"
                size="small"
                type="primary"
                class="flex-1"
              >
                恢復
              </el-button>

              <!-- Delete button (disabled when fetching) -->
              <el-button
                @click="handleDelete(job.id)"
                :disabled="job.state === 'fetching'"
                size="small"
                type="danger"
                plain
                class="flex-1"
              >
                刪除
              </el-button>
            </div>
          </div>
        </div>
        <div
          v-if="activeFetchingJobs.length === 0"
          class="text-center py-10 text-eh-muted text-xs italic"
        >
          No active scraping jobs
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Scoped styles */
</style>
