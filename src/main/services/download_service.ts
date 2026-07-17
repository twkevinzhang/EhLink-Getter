import * as fs from 'fs'
import { basename, dirname, extname, join } from 'path'
import archiver from 'archiver'
import { TypeScriptEhentaiService, type EhentaiGateway } from './ehentai'

export interface DownloadOptions {
  gallery: any
  /** Resolved exclusively by WorkspaceRepository.resolveGalleryPath(gid). */
  targetPath: string
  isArchive?: boolean
  password?: string
  signal: AbortSignal
  onProgress: (data: {
    status?: string
    progress?: number
    level?: 'info' | 'warn' | 'error'
  }) => void
}

function detectImageExtension(data: Buffer): string | undefined {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'jpg'
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png'
  if (data.length >= 6 && /^GIF8[79]a$/.test(data.subarray(0, 6).toString('ascii')))
    return 'gif'
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'webp'
  if (data.length >= 2 && data.subarray(0, 2).toString('ascii') === 'BM') return 'bmp'
  if (
    data.length >= 12 &&
    data.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['avif', 'avis'].includes(data.subarray(8, 12).toString('ascii'))
  )
    return 'avif'
  return undefined
}

function imageFileName(
  originalUrl: string,
  resolvedUrl: string,
  index: number,
  data: Buffer,
  contentType: string,
): string {
  const mime = contentType.split(';', 1)[0].trim().toLowerCase()
  if (mime && !mime.startsWith('image/') && mime !== 'application/octet-stream') {
    throw new Error(`Downloaded response is not an image (${mime})`)
  }
  const extension = detectImageExtension(data)
  if (!extension) throw new Error('Downloaded response is not a supported image')

  let rawName = ''
  for (const candidate of [originalUrl, resolvedUrl]) {
    try {
      rawName = decodeURIComponent(basename(new URL(candidate).pathname))
      if (rawName) break
    } catch {
      // Fall through to a stable page number.
    }
  }
  const existingExtension = extname(rawName)
  const stem = (
    existingExtension ? rawName.slice(0, -existingExtension.length) : rawName
  ).trim()
  const safeStem = (stem || String(index + 1))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
  return `${safeStem || index + 1}.${extension}`
}

export class DownloadService {
  constructor(private gateway: EhentaiGateway = new TypeScriptEhentaiService()) {}

  async downloadGallery(
    options: DownloadOptions,
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const { gallery: meta, targetPath, isArchive, password, signal, onProgress } = options
    const url = meta.link

    try {
      if (!targetPath) throw new Error('Workspace gallery path is required')
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true })
      }

      if (!meta.image_links || meta.image_links.length === 0) {
        onProgress({ status: 'Fetching image list...' })
        const links = await this.gateway.fetchImageLinks(url, signal)
        meta.image_links = links.image_links ?? []
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
          const response = await this.gateway.fetchImage(imgUrl, signal)
          const fileName = imageFileName(
            imgUrl,
            response.resolvedUrl,
            i,
            response.data,
            response.contentType,
          )
          fs.writeFileSync(join(targetPath, fileName), response.data)
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
          if (signal.aborted || e?.name === 'AbortError') throw e
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
      if (signal.aborted || error?.name === 'AbortError') {
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
