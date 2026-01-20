import { defineStore } from "pinia";
import { ref } from "vue";
import { useConfigStore } from "./config";
import { useLogStore } from "./logs";

export interface DownloadJob {
  id: string;
  title: string;
  progress: number;
  status: string;
  mode: "running" | "paused" | "error" | "completed" | "pending";
  galleries: any[];
}

export const useDownloadStore = defineStore("download", () => {
  const downloadingJobs = ref<DownloadJob[]>([]);
  const completedTasks = ref<any[]>([]);
  const libraryGalleries = ref<any[]>([]);
  const configStore = useConfigStore();
  const logStore = useLogStore();

  function parsePath(template: string, gallery: any) {
    let path = template;
    // Extract ID from link like https://e-hentai.org/g/123456/token/
    const idMatch = gallery.link.match(/\/g\/(\d+)\//);
    const id = idMatch ? idMatch[1] : "unknown";

    // Simple title parsing
    // Usually: (Japanese) [English] or Title [English]
    // Here we'll just use the whole title for both if not easily separable
    const enTitle = gallery.title;
    const jpTitle = gallery.title;

    path = path.replace(/{ID}/g, id);
    path = path.replace(/{EN_TITLE}/g, enTitle);
    path = path.replace(/{JP_TITLE}/g, jpTitle);

    // Ensure it ends with a slash if it's a directory,
    // but here we probably want the filename too.
    // For now assume the template is the directory path.
    return path;
  }

  function addToQueue(jobId: string, title: string, galleries: any[]) {
    const existingJob = downloadingJobs.value.find((j) => j.id === jobId);
    if (existingJob) {
      existingJob.galleries = [...existingJob.galleries, ...galleries];
      existingJob.status = `Added ${galleries.length} more galleries.`;
      return;
    }

    const newJob: DownloadJob = {
      id: jobId,
      title: title,
      progress: 0,
      status: "Waiting in queue...",
      mode: "pending",
      galleries: galleries,
    };
    downloadingJobs.value.unshift(newJob);
  }

  async function startJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.id === jobId);
    if (job && (job.mode === "pending" || job.mode === "paused")) {
      await processDownload(job);
    }
  }

  async function startAllJobs() {
    const pendingJobs = downloadingJobs.value.filter(
      (j) => j.mode === "pending" || j.mode === "paused",
    );
    for (const job of pendingJobs) {
      // Non-blocking start for each job
      processDownload(job);
    }
  }

  async function processDownload(job: DownloadJob) {
    if (job.mode === "running") return;

    job.mode = "running";
    const galleries = job.galleries;
    const targetTemplate = configStore.config.download_path || "";
    let completedCount = 0;
    const totalCount = galleries.length;

    // Reset progress if starting fresh or update based on current progress
    // For now we keep it simple and just run through

    for (const gallery of galleries) {
      if (
        (job.mode as string) === "paused" ||
        (job.mode as string) === "pending"
      )
        break;

      const saveDir = parsePath(targetTemplate, gallery);
      const savePath = `${saveDir}/metadata.json`.replace(/\/+/g, "/");

      try {
        job.status = `Downloading: ${gallery.title}`;
        const result = await window.api.downloadImage({
          url: gallery.link,
          savePath: savePath,
        });

        if (result && result.success) {
          completedCount++;
          job.progress = Math.round((completedCount / totalCount) * 100);
        } else {
          const errMsg = `Failed to download ${gallery.link}: ${result?.error || "Unknown error"}`;
          console.error(errMsg);
          logStore.addLog({
            level: "error",
            message: errMsg,
          });
        }
      } catch (error: any) {
        const errMsg = `Error in download loop for ${gallery.title}: ${error.message}`;
        console.error(errMsg);
        logStore.addLog({
          level: "error",
          message: errMsg,
        });
      }
    }

    if (completedCount === totalCount) {
      job.mode = "completed";
      job.status = "Finished";
      completedTasks.value.unshift({
        ...job,
        date: new Date().toLocaleString(),
      });
    } else if (
      (job.mode as string) !== "paused" &&
      (job.mode as string) !== "pending"
    ) {
      job.mode = "error";
      job.status = `Error: Only ${completedCount}/${totalCount} completed`;
      logStore.addLog({
        level: "error",
        message: `Download job "${job.title}" failed. Completed: ${completedCount}/${totalCount}`,
      });
    }
  }

  function updateDownloadProgress(progressData: any) {
    // This was for sidecar-led progress, now we manually update in processDownload
  }

  function clearFinishedJobs() {
    downloadingJobs.value = downloadingJobs.value.filter(
      (j) => j.mode !== "completed" && j.mode !== "error",
    );
  }

  return {
    downloadingJobs,
    completedTasks,
    libraryGalleries,
    addToQueue,
    startJob,
    startAllJobs,
    updateDownloadProgress,
    clearFinishedJobs,
  };
});
