import { useElectronStorage } from '@renderer/composables/electron-storage'
import { plainValue } from '@renderer/utilities'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface LibraryGallery {
  gid?: string
  token?: string
  title: string
  link: string
  rating?: string | number
  category?: string
  thumb?: string
  language?: string
  posted?: string | number
  uploader?: string
  tags?: string[]
}

export const useLibraryStore = defineStore('library', () => {
  const galleries = useElectronStorage<LibraryGallery[]>('library.galleries', [])
  const isLibraryDownloaded = ref(false)
  const downloading = ref(false)
  const downloadProgress = ref(0)
  const error = ref<string | null>(null)

  /**
   * 檢查本地是否存在 library 檔案
   */
  async function checkLibraryExists() {
    try {
      const exists = await window.api.checkLibraryExists()
      isLibraryDownloaded.value = exists
      return exists
    } catch (err: any) {
      console.error('[LibraryStore] Failed to check library existence:', err)
      return false
    }
  }

  /**
   * 下載 library 檔案
   */
  async function downloadLibrary() {
    try {
      downloading.value = true
      downloadProgress.value = 0
      error.value = null

      const result = await window.api.downloadLibrary()
      downloading.value = false

      if (result.success) {
        isLibraryDownloaded.value = true
        return { success: true }
      } else {
        error.value = result.error
        return { success: false, error: result.error }
      }
    } catch (err: any) {
      downloading.value = false
      error.value = err.message
      return { success: false, error: err.message }
    }
  }

  /**
   * 執行關鍵字搜尋
   */
  async function searchLibrary(keywords: string) {
    if (!isLibraryDownloaded.value) {
      return { success: false, error: 'Library not downloaded' }
    }

    try {
      const payload = {
        keywords,
        fields: [
          'title',
          'link',
          'rating',
          'category',
          'thumb',
          'language',
          'posted',
          'uploader',
          'gid',
          'tags',
        ],
      }
      const response = await window.api.searchLibrary(plainValue(payload))
      if (response && response.results) {
        galleries.value = response.results
        return { success: true, count: response.results.length }
      } else if (response && response.error) {
        return { success: false, error: response.error }
      }
      return { success: false, error: 'Unknown response format' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  /**
   * 初始化下載進度監聽
   */
  function initProgressEventListener() {
    window.api.onDownloadProgress((data: { loaded: number; total: number }) => {
      downloading.value = true
      if (data.total > 0) {
        downloadProgress.value = Math.round((data.loaded / data.total) * 100)
      }
    })
  }

  return {
    galleries,
    isLibraryDownloaded,
    downloading,
    downloadProgress,
    error,
    checkLibraryExists,
    downloadLibrary,
    searchLibrary,
    initProgressEventListener,
  }
})
