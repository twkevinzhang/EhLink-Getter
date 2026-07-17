// src/renderer/src/env.d.ts
import { type ElectronAPI } from '@electron-toolkit/preload'
import type { AppAPI } from '@shared/types/api'

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppAPI
  }
}
