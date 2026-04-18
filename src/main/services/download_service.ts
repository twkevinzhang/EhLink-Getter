import { type BrowserWindow, app } from 'electron'
import axios from 'axios'
import * as fs from 'fs'
import { join, dirname } from 'path'
import archiver from 'archiver'
// @ts-ignore
import { registerFormat } from 'archiver'
// @ts-ignore
import zipEncryptable from 'archiver-zip-encryptable'
import { parseTemplatePath } from '../../shared/src/utilities'

export interface DownloadOptions {
  gallery: any // DownloadGallery
  isArchive?: boolean
  password?: string
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
  async downloadGallery(
    options: DownloadOptions,
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const { gallery: meta, isArchive, password } = options
      const url = meta.link

      // 2. Resolve Path
      const targetPath =
        meta.targetPath || parseTemplatePath(meta.targetTemplate || '', meta)
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }

      // 3. Save library.json
      fs.writeFileSync(join(targetPath, 'library.json'), JSON.stringify(meta, null, 2))

      // 4. Download Images
      const imageLinks = meta.image_links || []
      const totalImages = imageLinks.length
      let downloadedCount = 0

      for (let i = 0; i < imageLinks.length; i++) {
        const imgUrl = imageLinks[i]
        try {
          const response = await axios.get(`${this.SIDECAR_URL}/image/fetch`, {
            params: { url: imgUrl },
            responseType: 'arraybuffer',
          })

          // Use the ID part of the URL as filename to avoid duplicates
          const fileName = `${imgUrl.split('/').pop()}.jpg`
          fs.writeFileSync(join(targetPath, fileName), Buffer.from(response.data))
          downloadedCount++

          // Send progress to renderer
          this.sendProgress(url, {
            status: `Downloading (${downloadedCount}/${totalImages})`,
            progress: Math.round((downloadedCount / totalImages) * 100),
          })
        } catch (e: any) {
          this.sendProgress(url, {
            status: `Image skipped: ${e.message}`,
            level: 'warn',
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
      console.error('[DownloadService] Error:', error)
      const url = options.gallery?.link || 'unknown'
      this.sendProgress(url, {
        status: `Error: ${error.message}`,
        level: 'error',
      })
      return { success: false, error: String(error.message || error) }
    }
  }

  /**
   * Resolves the download path based on placeholders.
   */

  /**
   * Helper to ZIP a folder with optional password.
   */
  private async archiveFolder(
    folderPath: string,
    outputPath: string,
    password?: string,
  ): Promise<void> {
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
    try {
      // Defensively ensure data is a plain serializable object to avoid "An object could not be cloned" errors
      const payload = JSON.parse(
        JSON.stringify({
          url,
          ...data,
        }),
      )
      this.mainWindow?.webContents.send('download-status-update', payload)
    } catch (e) {
      console.error('Failed to send progress via IPC:', e)
    }
  }
}
