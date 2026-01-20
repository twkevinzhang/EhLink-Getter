import { defineStore } from "pinia";
import { ref } from "vue";
import { useConfigStore } from "./config";

export interface DownloadJob {
  id: string;
  title: string;
  progress: number;
  status: string;
  mode: "running" | "paused" | "error" | "completed";
}

export const useDownloadStore = defineStore("download", () => {
  const downloadingJobs = ref<DownloadJob[]>([]);
  const completedTasks = ref<any[]>([]);
  const libraryGalleries = ref<any[]>([]);
  const configStore = useConfigStore();

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

  async function startDownload(jobId: string, title: string, galleries: any[]) {
    const newJob: DownloadJob = {
      id: jobId,
      title: title,
      progress: 0,
      status: "Starting...",
      mode: "running",
    };
    downloadingJobs.value.unshift(newJob);

    const targetTemplate = configStore.config.download_path || "";
    let completedCount = 0;
    const totalCount = galleries.length;

    for (const gallery of galleries) {
      if (newJob.mode === "paused") break;

      const saveDir = parsePath(targetTemplate, gallery);
      // Construct a filename for the gallery metadata/HTML
      const savePath = `${saveDir}/metadata.json`.replace(/\/+/g, "/");

      try {
        newJob.status = `Downloading: ${gallery.title}`;
        const result = await window.api.downloadImage({
          url: gallery.link,
          savePath: savePath,
        });

        if (result && result.success) {
          completedCount++;
          newJob.progress = Math.round((completedCount / totalCount) * 100);
        } else {
          console.error(`Failed to download ${gallery.link}:`, result?.error);
        }
      } catch (error) {
        console.error(`Error in download loop:`, error);
      }
    }

    if (completedCount === totalCount) {
      newJob.mode = "completed";
      newJob.status = "Finished";
      completedTasks.value.unshift({
        ...newJob,
        date: new Date().toLocaleString(),
      });
    } else if (newJob.mode !== "paused") {
      newJob.mode = "error";
      newJob.status = `Error: Only ${completedCount}/${totalCount} completed`;
    }
  }

  function updateDownloadProgress(progressData: any) {
    // This was for sidecar-led progress, now we manually update in startDownload
    // Keeping it for potential other progress events if needed
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
    startDownload,
    updateDownloadProgress,
    clearFinishedJobs,
  };
});
