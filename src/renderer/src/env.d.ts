// src/renderer/src/env.d.ts
import { type ElectronAPI } from '@electron-toolkit/preload'
import type { AppConfig } from '@shared/utilities'
import type { SidecarAPI } from '@shared/types/api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: SidecarAPI
  }
}
