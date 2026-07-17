import axios, {
  type AxiosProxyConfig,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'

import type { EhentaiConfig } from './types'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface HttpTransport {
  request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>
}

export interface HttpResponse<T> {
  data: T
  status: number
  headers: Record<string, unknown>
}

export function normalizeCookieHeader(raw: string): string {
  const value = raw.trim()
  if (!value) return ''

  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (cookie): cookie is { name: string; value: string } =>
            typeof cookie === 'object' &&
            cookie !== null &&
            typeof (cookie as { name?: unknown }).name === 'string' &&
            typeof (cookie as { value?: unknown }).value === 'string',
        )
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ')
    }
  } catch {
    // A normal Cookie header is intentionally not JSON.
  }

  return value.replace(/[\r\n]+/g, '; ').replace(/^cookie:\s*/i, '')
}

function parseProxy(raw: string): AxiosProxyConfig {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported proxy protocol: ${url.protocol}`)
  }

  return {
    protocol: url.protocol.slice(0, -1),
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    ...(url.username
      ? {
          auth: {
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
          },
        }
      : {}),
  }
}

export class EhentaiHttpClient {
  private config: EhentaiConfig = { cookies: '', proxies: [] }
  private proxyIndex = 0

  constructor(private readonly transport: HttpTransport = axios) {}

  updateConfig(config: EhentaiConfig): void {
    const proxies = config.proxies.map((proxy) => proxy.trim()).filter(Boolean)
    proxies.forEach(parseProxy)
    this.config = { cookies: config.cookies, proxies }
    this.proxyIndex = 0
  }

  async request<T>(
    config: AxiosRequestConfig,
    options: { signal?: AbortSignal; timeout?: number; includeCookies?: boolean } = {},
  ): Promise<HttpResponse<T>> {
    const candidates = this.proxyCandidates()
    let lastError: unknown

    for (const candidate of candidates) {
      try {
        const cookie =
          options.includeCookies === false
            ? ''
            : normalizeCookieHeader(this.config.cookies)
        const response = await this.transport.request<T>({
          ...config,
          headers: {
            'User-Agent': USER_AGENT,
            ...(cookie ? { Cookie: cookie } : {}),
            ...config.headers,
          },
          proxy: candidate.proxy,
          signal: options.signal,
          timeout: options.timeout ?? 30_000,
          validateStatus: () => true,
        })

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`HTTP ${response.status} for ${String(config.url)}`)
        }
        this.proxyIndex = candidate.index
        return {
          data: response.data,
          status: response.status,
          headers: response.headers as Record<string, unknown>,
        }
      } catch (error) {
        if (options.signal?.aborted || axios.isCancel(error)) throw error
        lastError = error
        if (candidate.index >= 0 && this.config.proxies.length > 0) {
          this.proxyIndex = (candidate.index + 1) % this.config.proxies.length
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('HTTP request failed')
  }

  private proxyCandidates(): Array<{ index: number; proxy: AxiosProxyConfig | false }> {
    if (this.config.proxies.length === 0) return [{ index: -1, proxy: false }]
    return this.config.proxies.map((_, offset) => {
      const index = (this.proxyIndex + offset) % this.config.proxies.length
      return { index, proxy: parseProxy(this.config.proxies[index]) }
    })
  }
}
