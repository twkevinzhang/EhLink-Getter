import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DownloadService } from '../download_service'
import type { EhentaiGateway } from '../ehentai'

const tempPaths: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  tempPaths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
})

function targetPath(): string {
  const path = mkdtempSync(join(tmpdir(), 'ehlink-download-'))
  tempPaths.push(path)
  return path
}

function gatewayWithImage(data: Buffer, contentType: string): EhentaiGateway {
  return {
    updateConfig: vi.fn(),
    checkHealth: vi.fn(),
    fetchPage: vi.fn(),
    fetchGalleryMetadata: vi.fn(),
    fetchImageLinks: vi.fn(),
    fetchImage: vi.fn().mockResolvedValue({
      data,
      contentType,
      resolvedUrl: 'https://a.hath.network/original-name.png',
    }),
  } as unknown as EhentaiGateway
}

describe('DownloadService image validation', () => {
  it('uses the detected image format instead of forcing .jpg', async () => {
    const target = targetPath()
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const service = new DownloadService(gatewayWithImage(png, 'image/png'))

    const result = await service.downloadGallery({
      gallery: {
        link: 'https://e-hentai.org/g/123/token/',
        image_links: ['https://e-hentai.org/s/hash/123-1'],
      },
      targetPath: target,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
    })

    expect(result.success).toBe(true)
    expect(readdirSync(target)).toContain('123-1.png')
  })

  it('does not mark an HTML response as downloaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const target = targetPath()
    const service = new DownloadService(
      gatewayWithImage(Buffer.from('<html>login required</html>'), 'text/html'),
    )

    const result = await service.downloadGallery({
      gallery: {
        link: 'https://e-hentai.org/g/123/token/',
        image_links: ['https://e-hentai.org/s/hash/123-1'],
      },
      targetPath: target,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
    })

    expect(result).toMatchObject({ success: false, error: 'All image downloads failed' })
    expect(
      JSON.parse(readFileSync(join(target, 'library.json'), 'utf8')).downloaded_urls,
    ).toEqual([])
  })
})
