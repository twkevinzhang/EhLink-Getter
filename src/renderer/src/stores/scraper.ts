import { defineStore } from "pinia";
import { ref, computed } from "vue";
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
}

export const useScraperStore = defineStore("scraper", () => {
  const fetchingJobs = ref<ScraperJob[]>([]);
  const fetchedTasks = ref<any[]>([]);
  const draftGalleries = ref<any[]>([]);
  const baseStoragePath = ref("");

  const activeFetchingJobs = computed(() =>
    fetchingJobs.value.filter((job) => job.progress < 100),
  );

  const configStore = useConfigStore();
  const logStore = useLogStore();

  const getTasksFile = () => {
    if (!baseStoragePath.value) return "";
    return `${baseStoragePath.value}/tasks.json`;
  };

  const getDraftsFile = () => {
    if (!baseStoragePath.value) return "";
    return `${baseStoragePath.value}/galleries-download.json`;
  };

  async function saveTasksToFile() {
    const path = getTasksFile();
    if (!path || !window.api?.saveJSON) return;
    await window.api.saveJSON({
      path,
      data: {
        version: "1.0",
        jobs: JSON.parse(JSON.stringify(fetchingJobs.value)),
      },
    });
  }

  async function saveDrafts() {
    const path = getDraftsFile();
    if (!path || !window.api?.saveJSON) return;

    await window.api.saveJSON({
      path,
      data: {
        version: "1.0",
        galleries: JSON.parse(JSON.stringify(draftGalleries.value)),
      },
    });
  }

  async function loadDrafts() {
    const path = getDraftsFile();
    if (!path || !window.api?.readJSON) return;

    try {
      const result = await window.api.readJSON({ path });
      if (result && result.success && result.data?.galleries) {
        draftGalleries.value = result.data.galleries;
      }
    } catch (e) {
      console.warn("No existing drafts found or failed to load");
    }
  }

  function addGalleryToDraft(url: string, title?: string) {
    const pattern = /^https:\/\/e-hentai\.org\/g\/\d+\/[a-z0-9]+\/?$/;
    if (!pattern.test(url)) {
      throw new Error("Invalid E-Hentai gallery URL format");
    }

    if (draftGalleries.value.some((g) => g.link === url)) {
      throw new Error("Gallery already in draft list");
    }

    draftGalleries.value.unshift({
      id: `manual-${Date.now()}`,
      title:
        title ||
        `Manual Entry: ${url.split("/").filter(Boolean).slice(-2).join("/")}`,
      link: url,
    });
    saveDrafts();
  }

  function removeGalleryFromDraft(galleryId: string) {
    const idx = draftGalleries.value.findIndex((g) => g.id === galleryId);
    if (idx !== -1) {
      draftGalleries.value.splice(idx, 1);
      saveDrafts();
    }
  }

  async function startFetching(url: string, maxPages: number = Infinity) {
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

      let allItems: any[] = [];
      let nextToken: string | undefined = undefined;
      let pageCount = 0;
      let isFirstPage = true;

      const existingJob = fetchingJobs.value.find(
        (j) => j.link === url && j.id !== jobId,
      );
      if (existingJob) {
        allItems = existingJob.allItems || [];
        nextToken = existingJob.nextToken;
        pageCount = existingJob.currentPage || 0;
        isFirstPage = pageCount === 0;
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
          await saveTasksToFile();
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
          await saveTasksToFile();
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

        const newGalleries = allItems.map((item: any, idx: number) => ({
          id: `${jobId}-${idx}`,
          title: item.title,
          link: item.link,
          sourceJob: job.link,
        }));

        draftGalleries.value = [...newGalleries, ...draftGalleries.value];
        await saveDrafts();
        await saveTasksToFile();
      }
    } catch (error: any) {
      const errorJobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId);
      if (errorJobIdx !== -1) {
        fetchingJobs.value[errorJobIdx].status = `Error: ${error.message}`;
        fetchingJobs.value[errorJobIdx].state = "paused";
        await saveTasksToFile();
      }
    }
  }

  async function pauseFetching(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId);
    if (job && job.state === "fetching") {
      job.state = "paused";
      await saveTasksToFile();
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
          await saveTasksToFile();
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
          await saveTasksToFile();
        } else {
          break;
        }
        if (!nextToken) break;
      }

      job.progress = 100;
      job.status = `Finished: ${allItems.length} items found`;
      job.state = "waiting";

      const newGalleries = allItems.map((item: any, idx: number) => ({
        id: `${jobId}-${idx}`,
        title: item.title,
        link: item.link,
        sourceJob: job.link,
      }));

      draftGalleries.value = [...newGalleries, ...draftGalleries.value];
      await saveDrafts();
      await saveTasksToFile();
    } catch (error: any) {
      job.status = `Error: ${error.message}`;
      job.state = "paused";
      await saveTasksToFile();
    }
  }

  async function deleteFetchingJob(jobId: string) {
    const index = fetchingJobs.value.findIndex((j) => j.id === jobId);
    if (index !== -1) {
      fetchingJobs.value.splice(index, 1);
      await saveTasksToFile();
      logStore.addLog({
        level: "info",
        message: `Deleted fetch job: ${jobId}`,
      });
    }
  }

  async function deleteFetchedTask(taskId: string) {
    const jobIndex = fetchingJobs.value.findIndex((j) => j.id === taskId);
    if (jobIndex !== -1) {
      fetchingJobs.value.splice(jobIndex, 1);
      await saveTasksToFile();
    }

    logStore.addLog({
      level: "info",
      message: `Deleted fetched task: ${taskId}`,
    });
  }

  async function loadExistingTasks() {
    if (!window.api?.readJSON || !window.api?.getUserDataPath) return;

    try {
      if (!baseStoragePath.value) {
        baseStoragePath.value = await window.api.getUserDataPath();
      }

      const path = getTasksFile();
      const result = await window.api.readJSON({ path });
      if (result && result.success && result.data?.jobs) {
        const loadedJobs = result.data.jobs;
        for (const job of loadedJobs) {
          if (!fetchingJobs.value.some((j) => j.id === job.id)) {
            fetchingJobs.value.push(job);
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
    await loadDrafts();
  }

  // Auto load on init
  loadExistingTasks();

  return {
    fetchingJobs,
    fetchedTasks,
    draftGalleries,
    activeFetchingJobs,
    startFetching,
    pauseFetching,
    resumeFetching,
    deleteFetchingJob,
    deleteFetchedTask,
    loadExistingTasks,
    addGalleryToDraft,
    removeGalleryFromDraft,
    saveDrafts,
  };
});
