import { defineStore } from "pinia";
import { ref } from "vue";
import { useConfigStore } from "./config";
import { useLogStore } from "./logs";

export interface DownloadGallery {
  id: string;
  title: string;
  link: string;
  targetPath: string;
  isArchive: boolean;
  imageCount: number;
  status: string;
  progress: number;
  mode: "running" | "paused" | "error" | "completed" | "pending";
  password?: string;
}

export interface DownloadJob {
  id: string;
  title: string;
  progress: number;
  status: string;
  mode: "running" | "paused" | "error" | "completed" | "pending";
  galleries: DownloadGallery[];
  isExpanded?: boolean;
  isArchive?: boolean;
  password?: string;
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

  function addToQueue(
    jobId: string,
    title: string,
    galleries: any[],
    isArchive = false,
    password = "",
  ) {
    const targetTemplate = configStore.config.download_path || "";

    const mappedGalleries: DownloadGallery[] = galleries.map((g) => {
      const idMatch = g.link.match(/\/g\/(\d+)\//);
      const id = idMatch ? idMatch[1] : "unknown";
      const targetPath = parsePath(targetTemplate, g);

      return {
        id,
        title: g.title,
        link: g.link,
        targetPath,
        isArchive: isArchive, // Use the passed parameter
        imageCount: g.imageCount || 0,
        status: "Pending...",
        progress: 0,
        mode: "pending",
        password: password,
      };
    });

    const existingJob = downloadingJobs.value.find((j) => j.id === jobId);
    if (existingJob) {
      existingJob.galleries = [...existingJob.galleries, ...mappedGalleries];
      existingJob.status = `Added ${galleries.length} more galleries.`;
      return;
    }

    const newJob: DownloadJob = {
      id: jobId,
      title: title,
      progress: 0,
      status: "Waiting in queue...",
      mode: "pending",
      galleries: mappedGalleries,
      isExpanded: true,
      isArchive: isArchive,
      password: password,
    };
    downloadingJobs.value.unshift(newJob);
  }

  async function startJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.id === jobId);
    if (job && (job.mode === "pending" || job.mode === "paused")) {
      await processDownload(job);
    }
  }

  function pauseJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.id === jobId);
    if (job) {
      job.mode = "paused";
      job.status = "Paused";
      job.galleries.forEach((g) => {
        if (g.mode === "running" || g.mode === "pending") g.mode = "paused";
      });
    }
  }

  function stopJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.id === jobId);
    if (job) {
      job.mode = "paused";
      job.status = "Stopped";
      job.galleries.forEach((g) => (g.mode = "paused"));
    }
  }

  function restartJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.id === jobId);
    if (job) {
      job.progress = 0;
      job.mode = "pending";
      job.status = "Restarting...";
      job.galleries.forEach((g) => {
        g.progress = 0;
        g.mode = "pending";
        g.status = "Pending...";
      });
      startJob(jobId);
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

      if (gallery.mode === "completed") continue;

      gallery.mode = "running";
      const savePath = `${gallery.targetPath}/metadata.json`.replace(
        /\/+/g,
        "/",
      );

      try {
        gallery.status = "Downloading...";
        const result = await window.api.downloadImage({
          url: gallery.link,
          savePath: savePath,
        });

        if (result && result.success) {
          gallery.mode = "completed";
          gallery.progress = 100;
          gallery.status = "Completed";
          completedCount++;
          job.progress = Math.round((completedCount / totalCount) * 100);
          job.status = `Progress: ${completedCount}/${totalCount}`;
        } else {
          gallery.mode = "error";
          gallery.status = result?.error || "Error";
          const errMsg = `Failed to download ${gallery.link}: ${result?.error || "Unknown error"}`;
          console.error(errMsg);
          // ...
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
    pauseJob,
    stopJob,
    restartJob,
    updateDownloadProgress,
    clearFinishedJobs,
  };
});
