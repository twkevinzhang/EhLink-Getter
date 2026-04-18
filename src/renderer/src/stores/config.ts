import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'

export interface AppConfig {
  cookies: string
  proxies: string[]
  scan_thread_cnt: number
  download_thread_cnt: number
}

const STORAGE_KEYS = {
  COOKIES: 'eh_cookies',
}

const DEFAULT_CONFIG: AppConfig = {
  cookies: '',
  proxies: [],
  scan_thread_cnt: 3,
  download_thread_cnt: 5,
}

export const useConfigStore = defineStore('config', () => {
  // 使用 useStorage 建立響應式的 cookies 持久化儲存
  const cookiesStorage = useStorage(STORAGE_KEYS.COOKIES, DEFAULT_CONFIG.cookies)

  const config = ref<AppConfig>({
    ...DEFAULT_CONFIG,
    cookies: cookiesStorage.value,
  })

  const sidecarOnline = ref(false)

  const syncConfig = (newConfig: AppConfig) => {
    // cookiesStorage 已經透過 useStorage 自動處理 localStorage 同步
    // 但因為 config.cookies 改變時我們需要反映回 cookiesStorage
    cookiesStorage.value = newConfig.cookies

    if (window.api?.saveConfig) {
      // 使用 JSON parse/stringify 確保物件可克隆（跨 IPC 橋接）
      window.api.saveConfig(JSON.parse(JSON.stringify(newConfig)))
    }
  }

  // 監聽整個 config 物件的變化
  watch(config, (val) => syncConfig(val), { deep: true })

  const checkSidecarHealth = async () => {
    if (!window.api?.checkSidecarHealth) return
    try {
      const result = await window.api.checkSidecarHealth()
      sidecarOnline.value = result.success
    } catch {
      sidecarOnline.value = false
    }
  }

  async function init() {
    if (window.api?.getConfig) {
      const savedConfig = await window.api.getConfig()
      if (savedConfig) {
        config.value = {
          ...config.value,
          ...savedConfig,
          // 優先級：localStorage (useStorage) > savedConfig > DEFAULT
          cookies: cookiesStorage.value || savedConfig.cookies || DEFAULT_CONFIG.cookies,
        }
      }
    }
    await checkSidecarHealth()
  }

  init()
  setInterval(checkSidecarHealth, 5000)

  function updateConfig(newConfig: Partial<AppConfig>) {
    config.value = { ...config.value, ...newConfig }
  }

  return {
    config,
    sidecarOnline,
    updateConfig,
    checkSidecarHealth,
    init,
  }
})
