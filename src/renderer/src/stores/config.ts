import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { DEFAULT_CONFIG } from '@shared/utilities'
import type { AppConfig } from '@shared/types/api'

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>({ ...DEFAULT_CONFIG })
  const sidecarOnline = ref(false)
  const loading = ref(false)
  const error = ref('')

  async function checkSidecarHealth() {
    if (window.api?.checkSidecarHealth) {
      const response = await window.api.checkSidecarHealth()
      sidecarOnline.value = response.success
    } else {
      sidecarOnline.value = false
    }
  }

  useIntervalFn(checkSidecarHealth, 5000, { immediate: true })

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const result = await window.api.getConfig()
      if (!result.success || !result.config) {
        throw new Error(result.error || '無法讀取設定')
      }
      config.value = result.config
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
    }
  }

  async function updateConfig(newConfig: Partial<AppConfig>) {
    const nextConfig = { ...config.value, ...newConfig }
    const result = await window.api.saveConfig(nextConfig)
    if (!result.success) throw new Error(result.error || '無法儲存設定')
    config.value = nextConfig
  }

  async function loginEHentai() {
    return await window.api.loginEHentai()
  }

  return {
    config,
    sidecarOnline,
    loading,
    error,
    load,
    updateConfig,
    loginEHentai,
  }
})
