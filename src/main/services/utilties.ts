import { app } from 'electron'
import { join } from 'path'

export function configPath() {
  return join(app.getPath('userData'), 'config.json')
}

export function libraryPath() {
  return join(app.getPath('userData'), 'library.json')
}

export function downloadsPath() {
  return join(app.getPath('userData'), 'downloads')
}

export function userData() {
  return app.getPath('userData')
}
