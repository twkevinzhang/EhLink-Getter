import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { useElectronStorage } from '@renderer/composables/electron-storage'
import { CONFIG_STORE_KEY, DEFAULT_CONFIG, type AppConfig } from '@shared/utilities'

export const useConfigStore = defineStore('config', () => {
  const config = useElectronStorage(CONFIG_STORE_KEY, DEFAULT_CONFIG)
  const sidecarOnline = ref(false)

  async function checkSidecarHealth() {
    if (window.api?.checkSidecarHealth) {
      const result = await window.api.checkSidecarHealth()
      sidecarOnline.value = result.success
    } else {
      sidecarOnline.value = false
    }
  }

  useIntervalFn(checkSidecarHealth, 5000, { immediate: true })

  function updateConfig(newConfig: Partial<AppConfig>) {
    config.value = { ...config.value, ...newConfig }
  }

  async function loginEHentai() {
    return await window.api.loginEHentai()
  }

  return {
    config,
    sidecarOnline,
    updateConfig,
    loginEHentai,
  }
})
