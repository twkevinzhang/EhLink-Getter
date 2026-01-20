<script setup lang="ts">
import { useDownloadStore } from "../../stores/download";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";
import {
  Folder,
  Files,
  VideoPause,
  VideoPlay,
  RefreshRight,
  CloseBold,
  ArrowRight,
  ArrowDown,
  Close,
  Remove,
} from "@element-plus/icons-vue";

const downloadStore = useDownloadStore();
const { downloadingJobs } = storeToRefs(downloadStore);

const handlePauseAll = () => {
  downloadingJobs.value.forEach((job) => downloadStore.pauseJob(job.id));
  ElMessage.info("All downloads paused");
};

const handleStartAll = () => {
  downloadStore.startAllJobs();
  ElMessage.success("Started all pending/paused downloads");
};

const handleClear = () => {
  downloadingJobs.value = downloadingJobs.value.filter(
    (j) => j.mode !== "completed",
  );
  ElMessage.success("Cleared completed jobs");
};

const toggleJob = (job: any) => {
  job.isExpanded = !job.isExpanded;
};

const handlePauseJob = (jobId: string) => {
  downloadStore.pauseJob(jobId);
};

const handleResumeJob = (jobId: string) => {
  downloadStore.startJob(jobId);
};

const handleRestartJob = (jobId: string) => {
  downloadStore.restartJob(jobId);
};

const handleTerminateJob = (jobId: string) => {
  downloadStore.stopJob(jobId);
};
</script>

<template>
  <div class="p-4 flex flex-col gap-6 h-full overflow-hidden">
    <div class="eh-panel-card flex-1 flex flex-col overflow-hidden">
      <div class="eh-header flex justify-between items-center">
        <span>Active Downloads</span>
        <div class="flex gap-2">
          <el-button size="small" type="primary" @click="handleStartAll"
            >Start All</el-button
          >
          <el-button size="small" plain @click="handlePauseAll"
            >Pause All</el-button
          >
        </div>
      </div>

      <div
        class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-eh-panel/30"
      >
        <div
          v-for="job in downloadingJobs"
          :key="job.id"
          class="eh-panel-card bg-white/50 border border-eh-border/30 rounded-lg overflow-hidden flex flex-col transition-all"
        >
          <!-- Job Header -->
          <div
            class="flex items-center gap-3 p-3 bg-eh-bg/40 cursor-pointer hover:bg-eh-bg/60 transition-colors"
            @click="toggleJob(job)"
          >
            <el-icon class="text-eh-text">
              <component :is="job.isExpanded ? ArrowDown : ArrowRight" />
            </el-icon>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-4">
                <span class="text-sm font-bold text-eh-text truncate">{{
                  job.title
                }}</span>
                <div class="flex items-center gap-3">
                  <div
                    class="text-[10px] px-2 py-0.5 rounded border font-bold uppercase"
                    :class="{
                      'text-green-500 border-green-500':
                        job.mode === 'completed',
                      'text-red-500 border-red-500': job.mode === 'error',
                      'text-eh-accent border-eh-accent': job.mode === 'running',
                      'text-gray-400 border-gray-400':
                        job.mode === 'paused' || job.mode === 'pending',
                    }"
                  >
                    {{ job.mode }}
                  </div>
                  <div class="w-32">
                    <el-progress
                      :percentage="job.progress"
                      :stroke-width="8"
                      :show-text="false"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Job Actions -->
            <template v-if="job.mode === 'pending'">
              <el-tooltip content="Start" placement="top">
                <el-button
                  circle
                  size="small"
                  :icon="VideoPlay"
                  @click.stop="handleResumeJob(job.id)"
                />
              </el-tooltip>
            </template>
            <template v-if="job.mode === 'running'">
              <el-tooltip content="Pause" placement="top">
                <el-button
                  circle
                  size="small"
                  :icon="VideoPause"
                  @click.stop="handlePauseJob(job.id)"
                />
              </el-tooltip>
              <el-tooltip content="Terminate" placement="top">
                <el-button
                  disabled
                  circle
                  size="small"
                  type="primary"
                  :icon="Close"
                  @click.stop="handleTerminateJob(job.id)"
                />
              </el-tooltip>
            </template>
            <template v-if="job.mode === 'paused'">
              <el-tooltip content="Play" placement="top">
                <el-button
                  circle
                  size="small"
                  type="primary"
                  :icon="VideoPlay"
                  @click.stop="handleResumeJob(job.id)"
                />
              </el-tooltip>
              <el-tooltip content="Terminate" placement="top">
                <el-button
                  circle
                  size="small"
                  type="primary"
                  :icon="Close"
                  @click.stop="handleTerminateJob(job.id)"
                />
              </el-tooltip>
            </template>
            <template v-if="job.mode === 'error'">
              <el-tooltip content="Restart" placement="top">
                <el-button
                  circle
                  size="small"
                  :icon="RefreshRight"
                  @click.stop="handleRestartJob(job.id)"
                />
              </el-tooltip>
              <el-tooltip content="Terminate" placement="top">
                <el-button
                  circle
                  size="small"
                  :icon="Close"
                  @click.stop="handleTerminateJob(job.id)"
                />
              </el-tooltip>
            </template>
          </div>

          <!-- Gallery List (Collapsible) -->
          <div
            v-show="job.isExpanded"
            class="overflow-x-auto border-t border-eh-border/20"
          >
            <table class="w-full text-left border-collapse min-w-[800px]">
              <thead class="bg-eh-bg/10 text-[11px] text-eh-muted uppercase">
                <tr>
                  <th class="p-2 w-10"></th>
                  <th class="p-2 min-w-[200px]">Gallery Title</th>
                  <th class="p-2">Download Path</th>
                  <th class="p-2 w-24 text-center">Images</th>
                  <th class="p-2 w-32">Status</th>
                  <th class="p-2 w-20"></th>
                </tr>
              </thead>
              <tbody class="text-xs">
                <tr
                  v-for="gal in job.galleries"
                  :key="gal.id"
                  class="border-t border-eh-border/10 hover:bg-white/40 transition-colors group"
                >
                  <td class="p-2 text-center">
                    <el-icon
                      :class="
                        gal.isArchive
                          ? 'text-eh-cat-fictional'
                          : 'text-eh-accent'
                      "
                    >
                      <component :is="gal.isArchive ? Files : Folder" />
                    </el-icon>
                  </td>
                  <td class="p-2">
                    <div class="truncate max-w-[300px]" :title="gal.title">
                      {{ gal.title }}
                    </div>
                  </td>
                  <td class="p-2 font-mono text-[10px] text-eh-muted">
                    <div class="truncate max-w-[250px]" :title="gal.targetPath">
                      {{ gal.targetPath }}
                    </div>
                  </td>
                  <td class="p-2 text-center">{{ gal.imageCount }}</td>
                  <td class="p-2">
                    <div class="flex flex-col gap-1">
                      <div
                        class="flex justify-between items-center text-[10px]"
                      >
                        <span>{{ gal.status }}</span>
                        <span>{{ gal.progress }}%</span>
                      </div>
                      <el-progress
                        :percentage="gal.progress"
                        :stroke-width="4"
                        :show-text="false"
                        :status="
                          gal.mode === 'error'
                            ? 'exception'
                            : gal.mode === 'completed'
                              ? 'success'
                              : ''
                        "
                      />
                    </div>
                  </td>
                  <td class="p-2 text-right">
                    <!-- Individual Gallery Actions (Simplified for now) -->
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          v-if="downloadingJobs.length === 0"
          class="text-center py-10 text-eh-muted text-xs italic"
        >
          No active downloads
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <el-button
        danger
        plain
        class="flex-1 !rounded-none !h-10 font-bold uppercase tracking-widest"
        @click="handleClear"
      >
        Clear Finished
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
