import { defineStore } from 'pinia'
import { ref, watch, toRaw } from 'vue'

export interface AppConfig {
  cookies: string
  proxies: string[]
  scan_thread_cnt: number
  download_thread_cnt: number
  storage_strategy: 'eh_id' | 'traditional'
}

const STORAGE_KEYS = {
  COOKIES: 'eh_cookies',
  STRATEGY: 'eh_storage_strategy',
}

const DEFAULT_CONFIG: AppConfig = {
  cookies: '',
  proxies: [],
  scan_thread_cnt: 3,
  download_thread_cnt: 5,
  storage_strategy: 'traditional',
}

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>({
    ...DEFAULT_CONFIG,
    cookies: localStorage.getItem(STORAGE_KEYS.COOKIES) || DEFAULT_CONFIG.cookies,
    storage_strategy:
      (localStorage.getItem(STORAGE_KEYS.STRATEGY) as AppConfig['storage_strategy']) ||
      DEFAULT_CONFIG.storage_strategy,
  })

  const sidecarOnline = ref(false)

  const syncConfig = (newConfig: AppConfig) => {
    localStorage.setItem(STORAGE_KEYS.COOKIES, newConfig.cookies)
    localStorage.setItem(STORAGE_KEYS.STRATEGY, newConfig.storage_strategy)

    if (window.api?.saveConfig) {
      // Use JSON parse/stringify to ensure the object is cloneable across the IPC bridge
      window.api.saveConfig(JSON.parse(JSON.stringify(newConfig)))
    }
  }

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
          cookies:
            localStorage.getItem(STORAGE_KEYS.COOKIES) || savedConfig.cookies || '',
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
