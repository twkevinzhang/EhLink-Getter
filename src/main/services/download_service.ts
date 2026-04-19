import axios from 'axios'
import * as fs from 'fs'
import { join, dirname } from 'path'
import archiver from 'archiver'
// @ts-ignore
import { registerFormat } from 'archiver'
// @ts-ignore
import zipEncryptable from 'archiver-zip-encryptable'
import { parseTemplatePath } from '@shared/utilities'

export interface DownloadOptions {
  gallery: any
  isArchive?: boolean
  password?: string
  signal: AbortSignal
  onProgress: (data: {
    status?: string
    progress?: number
    level?: 'info' | 'warn' | 'error'
  }) => void
}

export class DownloadService {
  private SIDECAR_URL = 'http://127.0.0.1:8000'

  async downloadGallery(
    options: DownloadOptions,
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const { gallery: meta, isArchive, password, signal, onProgress } = options
    const url = meta.link

    try {
      const targetPath =
        meta.targetPath || parseTemplatePath(meta.targetTemplate || '', meta)
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }

      if (!meta.image_links || meta.image_links.length === 0) {
        onProgress({ status: 'Fetching image list...' })
        const linksResp = await axios.get(`${this.SIDECAR_URL}/gallery/image-links`, {
          params: { url },
          timeout: 5 * 60 * 1000,
          signal,
        })
        meta.image_links = linksResp.data?.image_links ?? []
      }

      const libraryPath = join(targetPath, 'library.json')

      // 讀取已有的 library.json 中的下載記錄（斷點續傳）
      let existingLibrary: any = {}
      if (fs.existsSync(libraryPath)) {
        try {
          existingLibrary = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'))
        } catch {
          existingLibrary = {}
        }
      }
      const downloadedSet = new Set<string>(existingLibrary.downloaded_urls ?? [])

      // 寫入最新 meta（保留 downloaded_urls）
      fs.writeFileSync(
        libraryPath,
        JSON.stringify({ ...meta, downloaded_urls: Array.from(downloadedSet) }, null, 2),
      )

      const imageLinks: string[] = meta.image_links || []
      const totalImages = imageLinks.length
      let downloadedCount = downloadedSet.size

      for (let i = 0; i < imageLinks.length; i++) {
        if (signal.aborted) break
        const imgUrl = imageLinks[i]
        if (downloadedSet.has(imgUrl)) {
          onProgress({
            status: `Downloading (${downloadedCount}/${totalImages})`,
            progress: Math.round((downloadedCount / totalImages) * 100),
          })
          continue
        }
        try {
          const response = await axios.get(`${this.SIDECAR_URL}/image/fetch`, {
            params: { url: imgUrl },
            responseType: 'arraybuffer',
            signal,
          })
          const fileName = `${imgUrl.split('/').pop()}.jpg`
          fs.writeFileSync(join(targetPath, fileName), Buffer.from(response.data))
          downloadedSet.add(imgUrl)
          downloadedCount++
          // 每張成功後寫回 downloaded_urls
          fs.writeFileSync(
            libraryPath,
            JSON.stringify(
              { ...meta, downloaded_urls: Array.from(downloadedSet) },
              null,
              2,
            ),
          )
          onProgress({
            status: `Downloading (${downloadedCount}/${totalImages})`,
            progress: Math.round((downloadedCount / totalImages) * 100),
          })
        } catch (e: any) {
          if (axios.isCancel(e)) throw e
          onProgress({ status: `Image skipped: ${e.message}`, level: 'warn' })
        }
      }

      if (signal.aborted) {
        return { success: false, error: 'aborted' }
      }

      if (downloadedCount === 0 && totalImages > 0) {
        throw new Error('All image downloads failed')
      }

      let finalPath = targetPath
      if (isArchive) {
        onProgress({ status: 'Archiving...', progress: 100 })
        const archivePath = `${targetPath}.zip`
        await this.archiveFolder(targetPath, archivePath, password)
        finalPath = archivePath
      }

      onProgress({ status: 'Completed', progress: 100 })
      return { success: true, path: finalPath }
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return { success: false, error: 'aborted' }
      }
      console.error('[DownloadService] Error:', error)
      onProgress({ status: `Error: ${error.message}`, level: 'error' })
      return { success: false, error: String(error.message || error) }
    }
  }

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
}
