import axios from 'axios'

import type { EhentaiGateway } from './ehentai_gateway'
import type {
  EhentaiConfig,
  FetchPageResponse,
  GalleryMetadata,
  ImageFetchResult,
  ImageLinksResponse,
} from './types'

export class GoSidecarGateway implements EhentaiGateway {
  constructor(
    private readonly sidecarUrl = `http://127.0.0.1:${process.env.SIDECAR_PORT || '8000'}`,
  ) {}

  async updateConfig(config: EhentaiConfig, signal?: AbortSignal): Promise<void> {
    await axios.post(`${this.sidecarUrl}/config`, config, { signal })
  }

  async checkHealth(signal?: AbortSignal): Promise<{ status: 'ok' }> {
    const response = await axios.get<{ status: 'ok' }>(`${this.sidecarUrl}/health`, {
      signal,
      timeout: 2_000,
    })
    return response.data
  }

  async fetchPage(
    url: string,
    next?: string,
    signal?: AbortSignal,
  ): Promise<FetchPageResponse> {
    const response = await axios.get<FetchPageResponse>(
      `${this.sidecarUrl}/tasks/fetch`,
      {
        params: { url, next },
        signal,
      },
    )
    return {
      ...response.data,
      items: (response.data.items ?? []).map((item) => ({
        ...item,
        gid: String(item.gid),
      })),
    }
  }

  async fetchGalleryMetadata(
    url: string,
    signal?: AbortSignal,
  ): Promise<GalleryMetadata> {
    const response = await axios.get<GalleryMetadata>(
      `${this.sidecarUrl}/gallery/metadata`,
      {
        params: { url },
        signal,
        timeout: 5 * 60_000,
      },
    )
    return { ...response.data, gid: String(response.data.gid) }
  }

  async fetchImageLinks(url: string, signal?: AbortSignal): Promise<ImageLinksResponse> {
    const response = await axios.get<ImageLinksResponse>(
      `${this.sidecarUrl}/gallery/image-links`,
      { params: { url }, signal, timeout: 5 * 60_000 },
    )
    return response.data
  }

  async fetchImage(url: string, signal?: AbortSignal): Promise<ImageFetchResult> {
    const response = await axios.get<ArrayBuffer>(`${this.sidecarUrl}/image/fetch`, {
      params: { url },
      responseType: 'arraybuffer',
      signal,
      timeout: 60_000,
    })
    return {
      data: Buffer.from(response.data),
      contentType: String(response.headers['content-type'] ?? 'image/jpeg'),
      resolvedUrl: url,
    }
  }
}
