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
  tasksPath?: string;
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
  const sidecarOnline = ref(false);

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

  // Helper to save all jobs to the current tasks.json
  async function saveTasksToFile(path: string) {
    if (!path || !window.api?.saveJSON) return;
    await window.api.saveJSON({
      path,
      data: {
        version: "1.0",
        jobs: JSON.parse(JSON.stringify(fetchingJobs.value)),
      },
    });
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
      tasksPath: tasksPath || config.tasks_path,
    };
    fetchingJobs.value.unshift(newJob);

    try {
      if (!window.api || !window.api.fetchPage) {
        throw new Error("IPC API not ready");
      }

      let allItems: any[] = [];
      let nextToken: string | undefined = undefined;
      let pageCount = 0;
      let isFirstPage = true;

      const path = tasksPath || config.tasks_path;
      if (path) {
        const readResult = await window.api.readJSON({ path });
        if (readResult && readResult.success) {
          if (Array.isArray(readResult.data)) {
            allItems = readResult.data;
            addLog({
              level: "info",
              message: `Migrated ${allItems.length} items from old tasks.json format.`,
            });
          } else if (readResult.data?.jobs) {
            const existingJob = readResult.data.jobs.find(
              (j: any) => j.link === url,
            );
            if (existingJob) {
              allItems = existingJob.allItems || [];
              nextToken = existingJob.nextToken;
              pageCount = existingJob.currentPage || 0;
              isFirstPage = pageCount === 0;
              addLog({
                level: "info",
                message: `Resuming existing task from file: ${url}`,
              });
            }
          }
        }
      }

      const jobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (jobIdx === -1) return;

      fetchingJobs.value[jobIdx].state = "fetching";
      fetchingJobs.value[jobIdx].allItems = allItems;
      fetchingJobs.value[jobIdx].nextToken = nextToken;
      fetchingJobs.value[jobIdx].currentPage = pageCount;

      while (isFirstPage || nextToken) {
        pageCount++;
        const currentJobIdx = fetchingJobs.value.findIndex(
          (j) => j.id === jobId,
        );
        if (currentJobIdx === -1) break;

        if (fetchingJobs.value[currentJobIdx].state === "paused") {
          fetchingJobs.value[currentJobIdx].nextToken = nextToken;
          fetchingJobs.value[currentJobIdx].allItems = JSON.parse(
            JSON.stringify(allItems),
          );
          fetchingJobs.value[currentJobIdx].currentPage = pageCount - 1;
          fetchingJobs.value[currentJobIdx].totalItems = allItems.length;
          await saveTasksToFile(
            fetchingJobs.value[currentJobIdx].tasksPath || config.tasks_path,
          );
          return;
        }

        if (pageCount > maxPages) {
          addLog({
            level: "info",
            message: `Reached page limit (${maxPages}).`,
          });
          break;
        }

        fetchingJobs.value[currentJobIdx].status =
          `Fetching page ${pageCount}... (Found ${allItems.length})`;
        fetchingJobs.value[currentJobIdx].progress = Math.min(
          pageCount * 5,
          95,
        );
        fetchingJobs.value[currentJobIdx].currentPage = pageCount;
        fetchingJobs.value[currentJobIdx].totalItems = allItems.length;

        const result = await window.api.fetchPage({ url, next: nextToken });

        if (result && result.items) {
          allItems = [...allItems, ...result.items];
          nextToken = result.next;
          isFirstPage = false;
          fetchingJobs.value[currentJobIdx].allItems = allItems;
          fetchingJobs.value[currentJobIdx].nextToken = nextToken;
          await saveTasksToFile(
            fetchingJobs.value[currentJobIdx].tasksPath || config.tasks_path,
          );
        } else {
          break;
        }
        if (!nextToken) break;
      }

      const finalJobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (finalJobIdx !== -1) {
        const job = fetchingJobs.value[finalJobIdx];
        job.progress = 100;
        job.status = `Finished: ${allItems.length} items found`;
        job.state = "waiting";

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
        await saveTasksToFile(job.tasksPath || config.tasks_path);
      }
    } catch (error: any) {
      const errorJobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (errorJobIdx !== -1) {
        fetchingJobs.value[errorJobIdx].status = `Error: ${error.message}`;
        fetchingJobs.value[errorJobIdx].state = "paused";
        await saveTasksToFile(
          fetchingJobs.value[errorJobIdx].tasksPath || config.tasks_path,
        );
      }
    }
  }

  async function pauseFetching(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId);
    if (job && job.state === "fetching") {
      job.state = "paused";
      await saveTasksToFile(job.tasksPath || config.tasks_path);
      addLog({ level: "info", message: `Pausing fetch job: ${jobId}` });
    }
  }

  async function resumeFetching(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId);
    if (!job || job.state !== "paused") return;

    try {
      if (!window.api || !window.api.fetchPage)
        throw new Error("IPC API not ready");
      job.state = "fetching";
      let nextToken = job.nextToken;
      let allItems = [...job.allItems];
      let pageCount = job.currentPage;

      while (nextToken || pageCount === 0) {
        pageCount++;
        if ((job.state as any) === "paused") {
          job.nextToken = nextToken;
          job.allItems = JSON.parse(JSON.stringify(allItems));
          job.currentPage = pageCount - 1;
          await saveTasksToFile(job.tasksPath || config.tasks_path);
          return;
        }
        job.status = `Fetching page ${pageCount}... (Found ${allItems.length})`;
        job.progress = Math.min(pageCount * 5, 95);
        const result = await window.api.fetchPage({
          url: job.link,
          next: nextToken,
        });
        if (result && result.items) {
          allItems = [...allItems, ...result.items];
          nextToken = result.next;
          job.allItems = allItems;
          job.nextToken = nextToken;
          job.currentPage = pageCount;
          job.totalItems = allItems.length;
          await saveTasksToFile(job.tasksPath || config.tasks_path);
        } else {
          break;
        }
        if (!nextToken) break;
      }

      job.progress = 100;
      job.status = `Finished: ${allItems.length} items found`;
      job.state = "waiting";
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
      await saveTasksToFile(job.tasksPath || config.tasks_path);
    } catch (error: any) {
      job.status = `Error: ${error.message}`;
      job.state = "paused";
      await saveTasksToFile(job.tasksPath || config.tasks_path);
    }
  }

  async function deleteFetchingJob(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId);
    if (job && (job.state === "waiting" || job.state === "paused")) {
      const index = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (index !== -1) {
        const path = job.tasksPath || config.tasks_path;
        fetchingJobs.value.splice(index, 1);
        await saveTasksToFile(path);
        addLog({
          level: "info",
          message: `Deleted fetch job: ${jobId}`,
        });
      }
    }
  }

  async function loadExistingTasks(path: string, url: string = "") {
    if (!path) return;

    try {
      const result = await window.api.readJSON({ path });
      if (result && result.success) {
        let loadedJobs: ScraperJob[] = [];

        if (Array.isArray(result.data)) {
          // Legacy migration
          const jobId = `imported-${Date.now()}`;
          loadedJobs = [
            {
              id: jobId,
              link: url || "Imported Task",
              progress: 100,
              status: `Imported ${result.data.length} items`,
              state: "waiting",
              currentPage: 0,
              totalItems: result.data.length,
              allItems: result.data,
              tasksPath: path,
            },
          ];
        } else if (result.data?.jobs) {
          loadedJobs = result.data.jobs;
        }

        // Merge into current state
        for (const job of loadedJobs) {
          if (!fetchingJobs.value.some((j) => j.id === job.id)) {
            fetchingJobs.value.push(job);

            // If job has items, also show in fetchedTasks
            if (job.allItems && job.allItems.length > 0) {
              const fetchedTask = {
                id: job.id,
                title: job.link.startsWith("http")
                  ? `Fetched from ${new URL(job.link).hostname} (${job.allItems.length} items)`
                  : `${job.link} (${job.allItems.length} items)`,
                galleryCount: job.allItems.length,
                galleries: job.allItems.map((item: any, idx: number) => ({
                  id: `${job.id}-${idx}`,
                  title: item.title,
                  link: item.link,
                })),
              };
              if (!fetchedTasks.value.some((t) => t.id === job.id)) {
                fetchedTasks.value.push(fetchedTask);
              }
            }
          }
        }
        addLog({ level: "info", message: `Loaded tasks state from ${path}` });
      }
    } catch (e) {
      console.error("Failed to load tasks:", e);
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

  async function checkSidecarHealth() {
    if (window.api && window.api.checkSidecarHealth) {
      try {
        const result = await window.api.checkSidecarHealth();
        sidecarOnline.value = result.success;
      } catch (e) {
        sidecarOnline.value = false;
      }
    }
  }

  async function initConfig() {
    if (window.api && window.api.getConfig) {
      const savedConfig = await window.api.getConfig();
      if (savedConfig) {
        Object.assign(config, savedConfig);
      }
    }
    // Start health check polling
    checkSidecarHealth();
    setInterval(checkSidecarHealth, 5000);
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
    loadExistingTasks,
    sidecarOnline,
    checkSidecarHealth,
  };
});
