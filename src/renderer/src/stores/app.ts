import { defineStore } from "pinia";
import { ref, reactive } from "vue";

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
}

interface ScraperJob {
  id: string;
  link: string;
  progress: number;
  status: string;
  state: "waiting" | "fetching" | "paused";
  currentPage: number;
  totalItems: number;
  nextToken?: string;
  allItems: any[];
}

interface DownloadJob {
  id: string;
  title: string;
  progress: number;
  status: string;
  mode: "running" | "paused" | "error";
}

export const useAppStore = defineStore("app", () => {
  // State
  const logs = ref<LogEntry[]>([]);
  const config = reactive({
    cookies: "",
    proxies: [] as string[],
    tasks_path: "tasks.json",
    metadata_path: "metadata.json",
    download_path: "output",
    scan_thread_cnt: 3,
    download_thread_cnt: 5,
    storage_strategy: "logical" as "logical" | "traditional",
  });
  const fetchingJobs = ref<ScraperJob[]>([]);
  const fetchedTasks = ref<any[]>([]);
  const downloadingJobs = ref<DownloadJob[]>([]);
  const completedTasks = ref<any[]>([]);
  const libraryGalleries = ref<any[]>([]);

  // Actions
  function addLog(log: any) {
    const entry = {
      ...log,
      timestamp: new Date().toLocaleTimeString(),
    };
    logs.value.unshift(entry);
    if (logs.value.length > 500) logs.value.pop();

    // Automatically update progress if log contains specific patterns
    if (log.message && log.message.includes("Parsing Page")) {
      const match = log.message.match(/Parsing Page (\d+)\/(\d+)/);
      if (match && fetchingJobs.value.length > 0) {
        const current = parseInt(match[1]);
        const total = parseInt(match[2]);
        fetchingJobs.value[0].progress = Math.round((current / total) * 100);
        fetchingJobs.value[0].status = log.message;
      }
    }
  }

  function updateConfig(newConfig: any) {
    Object.assign(config, newConfig);
    if (window.api && window.api.saveConfig) {
      window.api.saveConfig(JSON.parse(JSON.stringify(config)));
    }
  }

  async function startFetching(
    url: string,
    tasksPath?: string,
    maxPages: number = Infinity,
  ) {
    if (tasksPath) {
      config.tasks_path = tasksPath;
    }
    const jobId = Date.now().toString();
    const newJob: ScraperJob = {
      id: jobId,
      link: url,
      progress: 0,
      status: "Starting...",
      state: "waiting",
      currentPage: 0,
      totalItems: 0,
      nextToken: undefined,
      allItems: [],
    };
    fetchingJobs.value.unshift(newJob);

    try {
      if (!window.api || !window.api.fetchPage) {
        throw new Error("IPC API not ready");
      }

      let nextToken: string | undefined = undefined;
      let allItems: any[] = [];
      let pageCount = 0;
      let isFirstPage = true;

      // Import existing tasks if file exists
      if (config.tasks_path) {
        const readResult = await window.api.readJSON({
          path: config.tasks_path,
        });
        if (
          readResult &&
          readResult.success &&
          Array.isArray(readResult.data)
        ) {
          allItems = readResult.data;
          addLog({
            level: "info",
            message: `Imported ${allItems.length} existing tasks from ${config.tasks_path}`,
          });
        }
      }

      const jobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (jobIdx === -1) return;

      fetchingJobs.value[jobIdx].state = "fetching";

      while (isFirstPage || nextToken) {
        pageCount++;

        // Check if task was paused
        const currentJobIdx = fetchingJobs.value.findIndex(
          (j) => j.id === jobId,
        );
        if (currentJobIdx === -1) break;

        if (fetchingJobs.value[currentJobIdx].state === "paused") {
          // Save current state for resume (serialize to avoid reference issues)
          fetchingJobs.value[currentJobIdx].nextToken = nextToken;
          fetchingJobs.value[currentJobIdx].allItems = JSON.parse(
            JSON.stringify(allItems),
          );
          fetchingJobs.value[currentJobIdx].currentPage = pageCount;
          fetchingJobs.value[currentJobIdx].totalItems = allItems.length;
          addLog({
            level: "info",
            message: "Fetch paused by user.",
          });
          return;
        }

        // Check page limit
        if (pageCount > maxPages) {
          addLog({
            level: "info",
            message: `Reached page limit (${maxPages}). Stopping fetch.`,
          });
          break;
        }

        if (currentJobIdx !== -1) {
          fetchingJobs.value[currentJobIdx].status =
            `Fetching page ${pageCount}... (Found ${allItems.length})`;
          fetchingJobs.value[currentJobIdx].progress = Math.min(
            pageCount * 5,
            95,
          );
          fetchingJobs.value[currentJobIdx].currentPage = pageCount;
          fetchingJobs.value[currentJobIdx].totalItems = allItems.length;
        }

        const result = await window.api.fetchPage({
          url: isFirstPage ? url : url,
          next: nextToken,
        });

        if (result && result.items) {
          allItems = [...allItems, ...result.items];
          nextToken = result.next;
          isFirstPage = false;

          // Update tasksPath/tasks.json after each page
          if (config.tasks_path) {
            await window.api.saveJSON({
              path: config.tasks_path,
              data: JSON.parse(JSON.stringify(allItems)),
            });
          }
        } else {
          break;
        }

        if (!nextToken) break;
      }

      const finalFetchedTask = {
        id: jobId,
        title: `Fetched from ${new URL(url).hostname} (${allItems.length} items)`,
        galleryCount: allItems.length,
        galleries: allItems.map((item: any, idx: number) => ({
          id: `${jobId}-${idx}`,
          title: item.title,
          link: item.link,
        })),
      };
      fetchedTasks.value.unshift(finalFetchedTask);

      const finalJobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (finalJobIdx !== -1) {
        fetchingJobs.value[finalJobIdx].progress = 100;
        fetchingJobs.value[finalJobIdx].status =
          `Finished: ${allItems.length} items found`;
        fetchingJobs.value[finalJobIdx].state = "waiting";
      }
    } catch (error: any) {
      const errorJobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (errorJobIdx !== -1) {
        fetchingJobs.value[errorJobIdx].status = `Error: ${error.message}`;
        fetchingJobs.value[errorJobIdx].state = "paused";
      }
    }
  }

  async function pauseFetching(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId);
    if (job && job.state === "fetching") {
      job.state = "paused";
      addLog({
        level: "info",
        message: `Pausing fetch job: ${jobId}`,
      });
    }
  }

  async function resumeFetching(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId);
    if (!job || job.state !== "paused") return;

    try {
      if (!window.api || !window.api.fetchPage) {
        throw new Error("IPC API not ready");
      }

      job.state = "fetching";
      let nextToken = job.nextToken;
      let allItems = [...job.allItems];
      let pageCount = job.currentPage;

      while (nextToken) {
        pageCount++;

        // Check if paused again
        const currentJob = fetchingJobs.value.find((j) => j.id === jobId);
        if (!currentJob || currentJob.state === "paused") {
          if (currentJob) {
            currentJob.nextToken = nextToken;
            currentJob.allItems = JSON.parse(JSON.stringify(allItems));
            currentJob.currentPage = pageCount;
            currentJob.totalItems = allItems.length;
          }
          return;
        }

        job.status = `Fetching page ${pageCount}... (Found ${allItems.length})`;
        job.progress = Math.min(pageCount * 5, 95);
        job.currentPage = pageCount;
        job.totalItems = allItems.length;

        const result = await window.api.fetchPage({
          url: job.link,
          next: nextToken,
        });

        if (result && result.items) {
          allItems = [...allItems, ...result.items];
          nextToken = result.next;

          if (config.tasks_path) {
            // Serialize to ensure IPC compatibility
            await window.api.saveJSON({
              path: config.tasks_path,
              data: JSON.parse(JSON.stringify(allItems)),
            });
          }
        } else {
          break;
        }

        if (!nextToken) break;
      }

      // Completed
      const finalFetchedTask = {
        id: jobId,
        title: `Fetched from ${new URL(job.link).hostname} (${allItems.length} items)`,
        galleryCount: allItems.length,
        galleries: allItems.map((item: any, idx: number) => ({
          id: `${jobId}-${idx}`,
          title: item.title,
          link: item.link,
        })),
      };
      fetchedTasks.value.unshift(finalFetchedTask);

      job.progress = 100;
      job.status = `Finished: ${allItems.length} items found`;
      job.state = "waiting";
    } catch (error: any) {
      job.status = `Error: ${error.message}`;
      job.state = "paused";
    }
  }

  function deleteFetchingJob(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId);
    if (job && (job.state === "waiting" || job.state === "paused")) {
      const index = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (index !== -1) {
        fetchingJobs.value.splice(index, 1);
        addLog({
          level: "info",
          message: `Deleted fetch job: ${jobId}`,
        });
      }
    }
  }

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

  async function cancelFetching(jobId: string) {
    // Deprecated: Use pauseFetching instead
    await pauseFetching(jobId);
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

  async function initConfig() {
    if (window.api && window.api.getConfig) {
      const savedConfig = await window.api.getConfig();
      if (savedConfig) {
        Object.assign(config, savedConfig);
      }
    }
  }

  // Initialize
  initConfig();

  return {
    logs,
    config,
    fetchingJobs,
    fetchedTasks,
    downloadingJobs,
    completedTasks,
    libraryGalleries,
    addLog,
    updateConfig,
    startFetching,
    pauseFetching,
    resumeFetching,
    deleteFetchingJob,
    startDownload,
    cancelFetching,
    clearFinishedJobs,
    updateDownloadProgress,
  };
});
