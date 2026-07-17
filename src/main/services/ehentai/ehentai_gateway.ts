import type {
  EhentaiConfig,
  FetchPageResponse,
  GalleryMetadata,
  ImageFetchResult,
  ImageLinksResponse,
} from './types'

/** Scraper boundary shared by the in-process TypeScript engine and temporary Go fallback. */
export interface EhentaiGateway {
  updateConfig(config: EhentaiConfig, signal?: AbortSignal): Promise<void>
  checkHealth(signal?: AbortSignal): Promise<{ status: 'ok' }>
  fetchPage(url: string, next?: string, signal?: AbortSignal): Promise<FetchPageResponse>
  fetchGalleryMetadata(url: string, signal?: AbortSignal): Promise<GalleryMetadata>
  fetchImageLinks(url: string, signal?: AbortSignal): Promise<ImageLinksResponse>
  fetchImage(url: string, signal?: AbortSignal): Promise<ImageFetchResult>
}
