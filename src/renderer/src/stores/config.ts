import { defineStore } from "pinia";
import { reactive, ref, watch } from "vue";

export const useConfigStore = defineStore("config", () => {
  // 1. 初始化狀態：cookies 優先從 localStorage 讀取以保證 SSOT
  const config = reactive({
    cookies: localStorage.getItem("eh_cookies") || "",
    proxies: [] as string[],
    metadata_path: "metadata.json",
    download_path: "output",
    scan_thread_cnt: 3,
    download_thread_cnt: 5,
    storage_strategy: "logical" as "logical" | "traditional",
  });

  const sidecarOnline = ref(false);

  // 2. 聲明式同步：利用 watch 監聽 config 的任何變化
  // 一旦變動，自動同步到 localStorage 與 Electron 主進程
  watch(
    config,
    (newConfig) => {
      // 同步 cookies 到 localStorage
      if (newConfig.cookies !== undefined) {
        localStorage.setItem("eh_cookies", newConfig.cookies);
      }
      
      // 同步全體配置到 Electron 主進程 (進而同步至 Go sidecar)
      if (window.api && window.api.saveConfig) {
        // 使用序列化副本避免 Proxy 傳輸問題
        window.api.saveConfig(JSON.parse(JSON.stringify(newConfig)));
      }
    },
    { deep: true }, // 強制深度監聽
  );

  // 3. sidecar 健康檢查
  const checkSidecarHealth = async () => {
    if (window.api && window.api.checkSidecarHealth) {
      try {
        const result = await window.api.checkSidecarHealth();
        sidecarOnline.value = result.success;
      } catch (e) {
        sidecarOnline.value = false;
      }
    }
  };

  // 4. 初始化邏輯：從主進程加載檔案配置
  async function initConfig() {
    if (window.api && window.api.getConfig) {
      const savedConfig = await window.api.getConfig();
      if (savedConfig) {
        const cookiesInLocal = localStorage.getItem("eh_cookies");
        // 合併配置，但保留 localStorage 中的 cookies 作為最終事實來源
        Object.assign(config, {
          ...savedConfig,
          cookies: cookiesInLocal || savedConfig.cookies || ""
        });
      }
    }
    checkSidecarHealth();
  }

  // 啟動與定時檢查
  initConfig();
  setInterval(checkSidecarHealth, 5000);

  // 5. 更新函數：現在只需修改物件，持久化會由 watch 自動處理
  function updateConfig(newConfig: any) {
    Object.assign(config, newConfig);
  }

  return {
    config,
    sidecarOnline,
    updateConfig,
    checkSidecarHealth,
  };
});
