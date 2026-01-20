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
  archiveProgress?: number;
  isArchiving?: boolean;
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
    let completedGalleriesCount = 0;
    const totalGalleriesCount = galleries.length;

    for (const gallery of galleries) {
      if (
        (job.mode as string) === "paused" ||
        (job.mode as string) === "pending"
      )
        break;

      if (gallery.mode === "completed") {
        completedGalleriesCount++;
        continue;
      }

      gallery.mode = "running";
      gallery.status = "Parsing metadata...";

      try {
        // 1. Fetch gallery metadata (resolves all image page links)
        const meta = await window.api.getGalleryMetadata({ url: gallery.link });

        if (meta.error) {
          gallery.mode = "error";
          gallery.status = meta.status ? `Error ${meta.status}` : meta.error;
          logStore.addLog({
            level: "error",
            message: `Parse Error [${gallery.title}]: ${meta.error}`,
          });
          continue;
        }

        // 2. Save metadata.json
        const metadataSavePath = `${gallery.targetPath}/metadata.json`.replace(
          /\/+/g,
          "/",
        );
        await window.api.saveJSON({ path: metadataSavePath, data: meta });

        // 3. Download each image
        const imageLinks = meta.image_links || [];
        const totalImages = imageLinks.length;
        let downloadedImages = 0;

        gallery.status = `Downloading (0/${totalImages})...`;

        for (const imgUrl of imageLinks) {
          // Check for pause/stop mid-gallery
          if ((job.mode as string) !== "running") break;

          const fileName = imgUrl.split("/").pop() + ".jpg"; // Temporary, Sidecar fetch_image resolves real name
          // Since Sidecar fetch_image is smart, we just pass the /s/ link
          const imageSavePath =
            `${gallery.targetPath}/${imgUrl.split("/").pop()}.jpg`.replace(
              /\/+/g,
              "/",
            );

          const result = await window.api.downloadImage({
            url: imgUrl,
            savePath: imageSavePath,
          });

          if (result && result.success) {
            downloadedImages++;
            gallery.progress = Math.round(
              (downloadedImages / totalImages) * 100,
            );
            gallery.status = `Downloading (${downloadedImages}/${totalImages})...`;
          } else {
            // Log error but maybe continue with other images or mark gallery as error
            const errMsg = `Image link failed: ${imgUrl} - ${result?.error}`;
            logStore.addLog({ level: "error", message: errMsg });
          }
        }

        if (downloadedImages === totalImages) {
          gallery.mode = "completed";
          gallery.progress = 100;
          gallery.status = "Completed";
          completedGalleriesCount++;
        } else {
          gallery.mode = "error";
          gallery.status = `Incomplete (${downloadedImages}/${totalImages})`;
        }

        job.progress = Math.round(
          (completedGalleriesCount / totalGalleriesCount) * 100,
        );
        job.status = `Progress: ${completedGalleriesCount}/${totalGalleriesCount} galleries.`;
      } catch (error: any) {
        gallery.mode = "error";
        gallery.status = error.message;
        logStore.addLog({
          level: "error",
          message: `Download Error [${gallery.title}]: ${error.message}`,
        });
      }
    }

    if (completedGalleriesCount === totalGalleriesCount) {
      if (job.isArchive) {
        job.isArchiving = true;
        job.status = "Archiving...";
        job.archiveProgress = 0;

        // Use the first gallery's targetPath as base to derive output zip path
        // Assuming targetPath is like /path/to/download/{TITLE}
        const firstGal = job.galleries[0];
        const folderToZip = firstGal.targetPath;
        // Get parent dir: /path/to/download
        const parentDir = folderToZip.split(/[\\/]/).slice(0, -1).join("/");
        // Get folder name: {TITLE}
        const folderName = folderToZip.split(/[\\/]/).pop();
        const archiveOutputPath = `${parentDir}/${folderName}.zip`;

        const result = await window.api.archiveFolder({
          folderPath: folderToZip,
          outputPath: archiveOutputPath,
          password: job.password,
        });

        if (result.success) {
          job.archiveProgress = 100;
          job.status = "Completed & Archived";
        } else {
          job.mode = "error";
          job.status = `Archive Error: ${result.error}`;
          logStore.addLog({
            level: "error",
            message: `Archive Error [${job.title}]: ${result.error}`,
          });
          return; // Stop here if archive fails
        }
      }

      job.mode = "completed";
      if (!job.isArchive) job.status = "Finished";
      completedTasks.value.unshift({
        ...job,
        date: new Date().toLocaleString(),
      });
    } else if (
      (job.mode as string) !== "paused" &&
      (job.mode as string) !== "pending"
    ) {
      job.mode = "error";
      job.status = `Error: ${completedGalleriesCount}/${totalGalleriesCount} galleries completed`;
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

  // Listen for archive progress from main process
  window.api.onArchiveProgress((data: any) => {
    const job = downloadingJobs.value.find((j) => {
      // Find job by checking if its derived path matches (simplified)
      // or we could add a job linking mechanism.
      // For now, let's assume we update the job that is currently "Archiving"
      return j.isArchiving && j.mode === "running";
    });
    if (job) {
      job.archiveProgress = data.progress;
    }
  });

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
