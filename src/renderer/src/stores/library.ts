import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LibraryGallery, SearchLibraryPayload } from '@shared/types/api'
import { plainValue } from '@renderer/utilities'

export const useLibraryStore = defineStore('library', () => {
  // 搜尋結果是暫時性資料，不持久化
  const galleries = ref<LibraryGallery[]>([])
  const isLibraryDownloaded = ref(false)
  const downloading = ref(false)
  const searching = ref(false)
  const downloadProgress = ref(0)
  const libraryPhase = ref<'download' | 'import' | 'index' | null>(null)
  const error = ref<string | null>(null)
  let progressListenerInitialized = false

  async function checkLibraryExists() {
    try {
      const exists = await window.api.checkLibraryExists()
      isLibraryDownloaded.value = exists.exists
      return exists
    } catch (err: unknown) {
      console.error('[LibraryStore] Failed to check library existence:', err)
      return false
    }
  }

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
      }
      error.value = result.error ?? 'Unknown error'
      return { success: false, error: result.error }
    } catch (err: unknown) {
      downloading.value = false
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      return { success: false, error: message }
    }
  }

  async function searchLibrary(
    keywords: string,
    filters?: { minRating?: number; includeExpunged?: boolean },
  ) {
    if (!isLibraryDownloaded.value) {
      return { success: false, error: 'Library not downloaded' }
    }
    try {
      searching.value = true
      const payload: SearchLibraryPayload = {
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
        ...(filters?.minRating !== undefined && { minRating: filters.minRating }),
        ...(filters?.includeExpunged !== undefined && {
          includeExpunged: filters.includeExpunged,
        }),
      }
      const response = await window.api.searchLibrary(plainValue(payload))
      if (response?.error) {
        return { success: false, error: response.error }
      }
      galleries.value = response?.results ?? []
      return { success: true, count: galleries.value.length }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    } finally {
      searching.value = false
    }
  }

  function initProgressEventListener() {
    if (progressListenerInitialized) return
    progressListenerInitialized = true
    window.api.onLibraryProgress((data) => {
      downloading.value = true
      libraryPhase.value = data.phase
      downloadProgress.value = data.progress
    })
  }

  return {
    galleries,
    isLibraryDownloaded,
    downloading,
    searching,
    downloadProgress,
    libraryPhase,
    error,
    checkLibraryExists,
    downloadLibrary,
    searchLibrary,
    initProgressEventListener,
  }
})
