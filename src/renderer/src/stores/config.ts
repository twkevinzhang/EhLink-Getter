import { defineStore } from "pinia";
import { reactive, ref } from "vue";

export const useConfigStore = defineStore("config", () => {
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

  const sidecarOnline = ref(false);

  function updateConfig(newConfig: any) {
    Object.assign(config, newConfig);
    if (window.api && window.api.saveConfig) {
      window.api.saveConfig(JSON.parse(JSON.stringify(config)));
    }
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
    checkSidecarHealth();
    setInterval(checkSidecarHealth, 5000);
  }

  // Initialize immediately
  initConfig();

  return {
    config,
    sidecarOnline,
    updateConfig,
    checkSidecarHealth,
  };
});
