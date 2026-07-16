import type { AppConfig, WorkspaceSettings } from './types/api'

export const DEFAULT_CONFIG: AppConfig = {
  cookies: '',
  proxies: [],
  scan_thread_cnt: 3,
  download_thread_cnt: 5,
}

export const CONFIG_STORE_KEY = 'config.config'
export const WORKSPACE_PATH_STORE_KEY = 'workspace.path'
export const WORKSPACE_DATA_DIR = '.ehlink-getter'
export const WORKSPACE_GALLERIES_DIR = 'galleries'

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  ...DEFAULT_CONFIG,
  isArchive: false,
  archivePassword: '',
}
