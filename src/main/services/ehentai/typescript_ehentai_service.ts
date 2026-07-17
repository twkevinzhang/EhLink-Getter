import type { AxiosRequestConfig } from 'axios'
import { load } from 'cheerio'

import type { EhentaiGateway } from './ehentai_gateway'
import { EhentaiHttpClient, type HttpTransport } from './http_client'
import {
  applyPaginationToken,
  extractGalleryIdentity,
  parseGalleryList,
} from './parsers/gallery_list'
import {
  normalizeApiMetadata,
  parseGalleryMetadataPage,
} from './parsers/gallery_metadata'
import type {
  EhentaiConfig,
  FetchPageResponse,
  GalleryMetadata,
  ImageFetchResult,
  ImageLinksResponse,
} from './types'

const METADATA_TIMEOUT = 5 * 60_000
const IMAGE_TIMEOUT = 60_000
const MAX_GALLERY_PAGES = 1_000

function assertAllowedUrl(raw: string, kind: 'gallery' | 'image'): URL {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('E-Hentai URLs must use HTTPS')

  const hostname = url.hostname.toLowerCase()
  const allowed =
    hostname === 'e-hentai.org' ||
    hostname.endsWith('.e-hentai.org') ||
    hostname === 'exhentai.org' ||
    hostname.endsWith('.exhentai.org') ||
    (kind === 'image' &&
      (hostname === 'ehgt.org' ||
        hostname.endsWith('.ehgt.org') ||
        hostname === 'hath.network' ||
        hostname.endsWith('.hath.network') ||
        hostname === 'hentaiverse.org' ||
        hostname.endsWith('.hentaiverse.org')))
  if (!allowed) throw new Error(`URL host is not allowed: ${hostname}`)
  return url
}

export interface TypeScriptEhentaiServiceOptions {
  transport?: HttpTransport
}

export class TypeScriptEhentaiService implements EhentaiGateway {
  private readonly http: EhentaiHttpClient

  constructor(options: TypeScriptEhentaiServiceOptions = {}) {
    this.http = new EhentaiHttpClient(options.transport)
  }

  async updateConfig(config: EhentaiConfig, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason ?? new Error('Operation aborted')
    this.http.updateConfig(config)
  }

  async checkHealth(signal?: AbortSignal): Promise<{ status: 'ok' }> {
    if (signal?.aborted) throw signal.reason ?? new Error('Operation aborted')
    return { status: 'ok' }
  }

  async fetchPage(
    url: string,
    next?: string,
    signal?: AbortSignal,
  ): Promise<FetchPageResponse> {
    assertAllowedUrl(url, 'gallery')
    const requestUrl = applyPaginationToken(url, next)
    const response = await this.http.request<string>(
      { method: 'GET', url: requestUrl, responseType: 'text' },
      { signal },
    )
    return parseGalleryList(response.data, requestUrl)
  }

  async fetchGalleryMetadata(
    url: string,
    signal?: AbortSignal,
  ): Promise<GalleryMetadata> {
    assertAllowedUrl(url, 'gallery')
    const { gid, token } = extractGalleryIdentity(url)
    try {
      const response = await this.http.request<{ gmetadata?: unknown[] }>(
        {
          method: 'POST',
          url: 'https://e-hentai.org/api.php',
          data: { method: 'gdata', gidlist: [[Number(gid), token]], namespace: 1 },
        },
        { signal, timeout: METADATA_TIMEOUT },
      )
      const gallery = response.data.gmetadata?.[0]
      return normalizeApiMetadata(gallery, url)
    } catch (error) {
      if (signal?.aborted) throw error
      return this.scrapeGallery(url, signal)
    }
  }

  async fetchImageLinks(url: string, signal?: AbortSignal): Promise<ImageLinksResponse> {
    const metadata = await this.scrapeGallery(url, signal)
    return { image_links: metadata.image_links, count: metadata.image_links.length }
  }

  async fetchImage(url: string, signal?: AbortSignal): Promise<ImageFetchResult> {
    let resolvedUrl = assertAllowedUrl(url, 'image').toString()
    if (new URL(resolvedUrl).pathname.includes('/s/')) {
      const page = await this.http.request<string>(
        { method: 'GET', url: resolvedUrl, responseType: 'text' },
        { signal, timeout: IMAGE_TIMEOUT },
      )
      const source = load(page.data)('img#img').attr('src')
      if (!source) throw new Error('Could not find the resolved image URL')
      resolvedUrl = assertAllowedUrl(
        new URL(source, resolvedUrl).toString(),
        'image',
      ).toString()
    }

    const response = await this.http.request<ArrayBuffer | Buffer>(
      { method: 'GET', url: resolvedUrl, responseType: 'arraybuffer' },
      {
        signal,
        timeout: IMAGE_TIMEOUT,
        // Gallery session cookies are required for E-Hentai pages, but must not
        // be disclosed to the external image CDN returned by an /s/ page.
        includeCookies: isGalleryHostname(new URL(resolvedUrl).hostname),
      },
    )
    const contentType = String(response.headers['content-type'] ?? 'image/jpeg')
    const data = Buffer.isBuffer(response.data)
      ? Buffer.from(response.data)
      : Buffer.from(new Uint8Array(response.data))
    return { data, contentType, resolvedUrl }
  }

  private async scrapeGallery(
    url: string,
    signal?: AbortSignal,
  ): Promise<GalleryMetadata> {
    assertAllowedUrl(url, 'gallery')
    let currentUrl: string | undefined = url
    let metadata: GalleryMetadata | undefined
    const imageLinks: string[] = []
    const visited = new Set<string>()

    for (let pageIndex = 0; currentUrl && pageIndex < MAX_GALLERY_PAGES; pageIndex++) {
      if (visited.has(currentUrl)) throw new Error('Gallery pagination loop detected')
      visited.add(currentUrl)
      const response = await this.http.request<string>(
        { method: 'GET', url: currentUrl, responseType: 'text' },
        { signal, timeout: METADATA_TIMEOUT },
      )
      const parsed = parseGalleryMetadataPage(response.data, currentUrl)
      metadata ??= parsed.metadata
      imageLinks.push(...parsed.metadata.image_links)
      currentUrl = parsed.nextPage
    }

    if (!metadata) throw new Error('Gallery returned no metadata')
    metadata.image_links = [...new Set(imageLinks)]
    metadata.count = metadata.image_links.length
    if (metadata.filecount === '0' && metadata.count > 0) {
      metadata.filecount = String(metadata.count)
    }
    return metadata
  }
}

function isGalleryHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === 'e-hentai.org' ||
    normalized.endsWith('.e-hentai.org') ||
    normalized === 'exhentai.org' ||
    normalized.endsWith('.exhentai.org')
  )
}

// Keep AxiosRequestConfig referenced in the emitted declarations used by injected transports.
export type EhentaiRequestConfig = AxiosRequestConfig
