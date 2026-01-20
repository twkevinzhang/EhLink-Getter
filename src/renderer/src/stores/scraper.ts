import { defineStore } from "pinia";
import { ref } from "vue";
import { useConfigStore } from "./config";
import { useLogStore } from "./logs";

export interface ScraperJob {
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

export const useScraperStore = defineStore("scraper", () => {
  const fetchingJobs = ref<ScraperJob[]>([]);
  const fetchedTasks = ref<any[]>([]);

  const configStore = useConfigStore();
  const logStore = useLogStore();

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
      configStore.config.tasks_path = tasksPath;
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
      tasksPath: tasksPath || configStore.config.tasks_path,
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

      const path = tasksPath || configStore.config.tasks_path;
      if (path) {
        const readResult = await window.api.readJSON({ path });
        if (readResult && readResult.success) {
          if (Array.isArray(readResult.data)) {
            allItems = readResult.data;
            logStore.addLog({
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
              logStore.addLog({
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
            fetchingJobs.value[currentJobIdx].tasksPath ||
              configStore.config.tasks_path,
          );
          return;
        }

        if (pageCount > maxPages) {
          logStore.addLog({
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
            fetchingJobs.value[currentJobIdx].tasksPath ||
              configStore.config.tasks_path,
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
        await saveTasksToFile(job.tasksPath || configStore.config.tasks_path);
      }
    } catch (error: any) {
      const errorJobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (errorJobIdx !== -1) {
        fetchingJobs.value[errorJobIdx].status = `Error: ${error.message}`;
        fetchingJobs.value[errorJobIdx].state = "paused";
        await saveTasksToFile(
          fetchingJobs.value[errorJobIdx].tasksPath ||
            configStore.config.tasks_path,
        );
      }
    }
  }

  async function pauseFetching(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId);
    if (job && job.state === "fetching") {
      job.state = "paused";
      await saveTasksToFile(job.tasksPath || configStore.config.tasks_path);
      logStore.addLog({
        level: "info",
        message: `Pausing fetch job: ${jobId}`,
      });
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
          await saveTasksToFile(job.tasksPath || configStore.config.tasks_path);
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
          await saveTasksToFile(job.tasksPath || configStore.config.tasks_path);
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
      await saveTasksToFile(job.tasksPath || configStore.config.tasks_path);
    } catch (error: any) {
      job.status = `Error: ${error.message}`;
      job.state = "paused";
      await saveTasksToFile(job.tasksPath || configStore.config.tasks_path);
    }
  }

  async function deleteFetchingJob(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId);
    if (job && (job.state === "waiting" || job.state === "paused")) {
      const index = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (index !== -1) {
        const path = job.tasksPath || configStore.config.tasks_path;
        fetchingJobs.value.splice(index, 1);
        await saveTasksToFile(path);
        logStore.addLog({
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

        for (const job of loadedJobs) {
          if (!fetchingJobs.value.some((j) => j.id === job.id)) {
            fetchingJobs.value.push(job);

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
        logStore.addLog({
          level: "info",
          message: `Loaded tasks state from ${path}`,
        });
      }
    } catch (e) {
      console.error("Failed to load tasks:", e);
    }
  }

  return {
    fetchingJobs,
    fetchedTasks,
    startFetching,
    pauseFetching,
    resumeFetching,
    deleteFetchingJob,
    loadExistingTasks,
  };
});
