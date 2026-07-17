export interface EhentaiConfig {
  cookies: string
  proxies: string[]
}

export interface FetchPageItem {
  gid: string
  token: string
  title: string
  link: string
  imagecount: number
}

export interface FetchPageResponse {
  items: FetchPageItem[]
  next?: string
}

export interface GalleryMetadata {
  gid: string
  token: string
  title: string
  title_jpn: string
  category: string
  thumb: string
  uploader: string
  posted: string
  filecount: string
  filesize: number
  expunged: boolean
  rating: string
  torrentcount: string
  tags: string[]
  image_links: string[]
  count: number
}

export interface ImageLinksResponse {
  image_links: string[]
  count: number
}

export interface ImageFetchResult {
  data: Buffer
  contentType: string
  resolvedUrl: string
}
