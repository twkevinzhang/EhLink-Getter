import { BrowserWindow, app } from 'electron'
import axios from 'axios'
import * as fs from 'fs'
import { join, dirname } from 'path'
import archiver from 'archiver'
// @ts-ignore
import { registerFormat } from 'archiver'
// @ts-ignore
import zipEncryptable from 'archiver-zip-encryptable'
import { AppConfig } from './config_service'

export interface DownloadOptions {
  url: string
  targetTemplate: string
  isArchive?: boolean
  password?: string
  metadata?: any // Optional pre-fetched metadata
}

export class DownloadService {
  private SIDECAR_URL = 'http://127.0.0.1:8000'
  private mainWindow: BrowserWindow | null

  constructor(mainWindow: BrowserWindow | null) {
    this.mainWindow = mainWindow
  }

  /**
   * Main entry point for downloading a single gallery.
   * Handles path resolution, metadata fetching, image downloading, and archiving.
   */
  async downloadGallery(options: DownloadOptions): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const { url, targetTemplate, isArchive, password } = options
      
      // 1. Fetch Metadata if not provided
      let meta = options.metadata
      if (!meta) {
        const metaResp = await axios.get(`${this.SIDECAR_URL}/gallery/metadata`, {
          params: { url }
        })
        meta = metaResp.data
        if (meta.error) {
          throw new Error(meta.error)
        }
      }

      // 2. Resolve Path
      const targetPath = this.resolvePath(targetTemplate, meta)
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }

      // 3. Save metadata.json
      fs.writeFileSync(join(targetPath, 'metadata.json'), JSON.stringify(meta, null, 2))

      // 4. Download Images
      const imageLinks = meta.image_links || []
      const totalImages = imageLinks.length
      let downloadedCount = 0

      for (let i = 0; i < imageLinks.length; i++) {
        const imgUrl = imageLinks[i]
        try {
          const response = await axios.get(`${this.SIDECAR_URL}/image/fetch`, {
            params: { url: imgUrl },
            responseType: 'arraybuffer'
          })
          
          // Use the ID part of the URL as filename to avoid duplicates
          const fileName = `${imgUrl.split('/').pop()}.jpg`
          fs.writeFileSync(join(targetPath, fileName), Buffer.from(response.data))
          downloadedCount++
          
          // Send progress to renderer
          this.sendProgress(url, {
            status: `Downloading (${downloadedCount}/${totalImages})`,
            progress: Math.round((downloadedCount / totalImages) * 100)
          })
        } catch (e: any) {
          this.sendProgress(url, {
            status: `Image skipped: ${e.message}`,
            level: 'warn'
          })
        }
      }

      if (downloadedCount === 0 && totalImages > 0) {
        throw new Error('All image downloads failed')
      }

      // 5. Archive if requested
      let finalPath = targetPath
      if (isArchive) {
        this.sendProgress(url, { status: 'Archiving...', progress: 100 })
        const archivePath = `${targetPath}.zip`
        await this.archiveFolder(targetPath, archivePath, password)
        finalPath = archivePath
        // Optionally delete the original folder after archiving? 
        // For now keep it to be safe, or follow Task Manager behavior.
      }

      this.sendProgress(url, { status: 'Completed', progress: 100, completed: true })
      return { success: true, path: finalPath }

    } catch (error: any) {
      this.sendProgress(options.url, { status: `Error: ${error.message}`, level: 'error' })
      return { success: false, error: error.message }
    }
  }

  /**
   * Resolves the download path based on placeholders.
   */
  private resolvePath(template: string, meta: any): string {
    const idMatch = meta.link.match(/\/g\/(\d+)\//)
    const id = idMatch ? idMatch[1] : 'unknown'
    const gid = meta.gid || id
    const token = meta.token || ''

    // 1. Prepare base path
    let path = template
    if (!path || path.trim() === '') {
      try {
        path = join(app.getPath('downloads'), '{EN_TITLE}')
      } catch (e) {
        path = join(app.getPath('userData'), 'downloads', '{EN_TITLE}')
      }
    }

    // 2. Safety replacement for filesystem
    const sanitize = (s: string) => (s || 'untitled').replace(/[\\/:*?"<>|]/g, '_')

    const replacements: Record<string, string> = {
      '{ID}': id,
      '{GID}': gid,
      '{TOKEN}': token,
      '{EN_TITLE}': sanitize(meta.title),
      '{JP_TITLE}': sanitize(meta.japanese_title || meta.title),
      '{CATEGORY}': sanitize(meta.category || 'Other')
    }

    // 3. Perform replacements on the path
    Object.keys(replacements).forEach(key => {
      const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      path = path.replace(regex, replacements[key])
    })

    return path
  }

  /**
   * Helper to ZIP a folder with optional password.
   */
  private async archiveFolder(folderPath: string, outputPath: string, password?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!fs.existsSync(dirname(outputPath))) {
          fs.mkdirSync(dirname(outputPath), { recursive: true })
        }

        const output = fs.createWriteStream(outputPath)
        const archive = archiver(password ? ('zip-encryptable' as any) : 'zip', {
          zlib: { level: 9 },
          forceLocalTime: true,
          ...(password ? { password } : {}),
        })

        output.on('close', () => resolve())
        archive.on('error', (err) => reject(err))
        archive.pipe(output)
        archive.directory(folderPath, false)
        archive.finalize()
      } catch (error) {
        reject(error)
      }
    })
  }

  private sendProgress(url: string, data: any) {
    this.mainWindow?.webContents.send('download-status-update', {
      url,
      ...data
    })
  }
}
