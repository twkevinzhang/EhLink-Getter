export interface AppConfig {
  cookies: string
  proxies: string[]
  scan_thread_cnt: number
  download_thread_cnt: number
}

export const DEFAULT_CONFIG: AppConfig = {
  cookies: '',
  proxies: [],
  scan_thread_cnt: 3,
  download_thread_cnt: 5,
}

export const CONFIG_STORE_KEY = 'config.config'

export function parseTemplatePath(template: string, meta: any): string {
  const gid = meta.gid
  const token = meta.token || ''

  // 1. Prepare base path
  let path = template
  if (!path || path.trim() === '') {
    throw new Error('template is empty')
  }

  // 2. Safety replacement for filesystem
  const sanitize = (s: string) => (s || 'untitled').replace(/[\\/:*?"<>|]/g, '_')

  const replacements: Record<string, string> = {
    '{GID}': gid,
    '{TOKEN}': token,
    '{EN_TITLE}': sanitize(meta.title),
    '{JP_TITLE}': sanitize(meta.japanese_title || meta.title),
    '{CATEGORY}': sanitize(meta.category || 'Other'),
  }

  // 3. Perform replacements on the path
  Object.keys(replacements).forEach((key) => {
    const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    path = path.replace(regex, replacements[key])
  })

  return path
}
