import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { WorkspaceSettings, WorkspaceState } from '@shared/types/api'

const emptyState = (): WorkspaceState => ({ configured: false, path: null })

export const useWorkspaceStore = defineStore('workspace', () => {
  const state = ref<WorkspaceState>(emptyState())
  const loading = ref(false)
  const error = ref('')
  let listening = false

  const configured = computed(() => state.value.configured)
  const path = computed(() => state.value.path ?? '')
  const folderName = computed(() => {
    const parts = path.value.replace(/[\\/]+$/, '').split(/[\\/]/)
    return parts.at(-1) || '工作資料夾'
  })

  function listen() {
    if (listening) return
    listening = true
    window.api.onWorkspaceUpdated((nextState) => {
      state.value = nextState
      error.value = ''
    })
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      state.value = await window.api.getWorkspaceState()
      listen()
      return state.value
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      state.value = emptyState()
      return state.value
    } finally {
      loading.value = false
    }
  }

  async function select() {
    loading.value = true
    error.value = ''
    try {
      const nextState = await window.api.selectWorkspace()
      state.value = nextState
      return nextState
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      return state.value
    } finally {
      loading.value = false
    }
  }

  async function loadSettings() {
    return window.api.getWorkspaceSettings()
  }

  async function saveSettings(settings: WorkspaceSettings) {
    return window.api.saveWorkspaceSettings(settings)
  }

  return {
    state,
    loading,
    error,
    configured,
    path,
    folderName,
    load,
    select,
    loadSettings,
    saveSettings,
  }
})
