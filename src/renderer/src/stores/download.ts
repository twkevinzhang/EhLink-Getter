import { defineStore } from "pinia";
import { ref } from "vue";

export interface DownloadJob {
  id: string;
  title: string;
  progress: number;
  status: string;
  mode: "running" | "paused" | "error";
}

export const useDownloadStore = defineStore("download", () => {
  const downloadingJobs = ref<DownloadJob[]>([]);
  const completedTasks = ref<any[]>([]);
  const libraryGalleries = ref<any[]>([]);

  async function startDownload(jobId: string, title: string, galleries: any[]) {
    const images = galleries.map((g) => ({
      title: g.title,
      link: g.link,
    }));

    const newJob: DownloadJob = {
      id: jobId,
      title: title,
      progress: 0,
      status: "Initializing...",
      mode: "running",
    };
    downloadingJobs.value.unshift(newJob);

    try {
      await window.api.startDownload({ jobId, images });
    } catch (error: any) {
      const jobIdx = downloadingJobs.value.findIndex((j) => j.id === jobId);
      if (jobIdx !== -1) {
        downloadingJobs.value[jobIdx].mode = "error";
        downloadingJobs.value[jobIdx].status = `Fail: ${error.message}`;
      }
    }
  }

  function updateDownloadProgress(progressData: any) {
    const job = downloadingJobs.value.find((j) => j.id === progressData.job_id);
    if (job) {
      job.progress = Math.round(
        (progressData.completed_count / progressData.total_count) * 100,
      );
      job.status = `Downloading: ${progressData.completed_count}/${progressData.total_count}`;
    }
  }

  function clearFinishedJobs() {
    downloadingJobs.value = downloadingJobs.value.filter(
      (j) => j.progress < 100 && j.mode !== "error",
    );
  }

  return {
    downloadingJobs,
    completedTasks,
    libraryGalleries,
    startDownload,
    updateDownloadProgress,
    clearFinishedJobs,
  };
});
