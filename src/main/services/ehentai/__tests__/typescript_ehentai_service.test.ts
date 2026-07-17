import { readFileSync } from 'fs'
import { join } from 'path'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { describe, expect, it, vi } from 'vitest'

import { normalizeCookieHeader, type HttpTransport } from '../http_client'
import { parseGalleryList } from '../parsers/gallery_list'
import { TypeScriptEhentaiService } from '../typescript_ehentai_service'

function fixture(name: string): string {
  return readFileSync(join(__dirname, 'fixtures', name), 'utf8')
}

function response<T>(
  data: T,
  status = 200,
  headers: Record<string, string> = {},
): AxiosResponse<T> {
  return { data, status, statusText: String(status), headers, config: {} as never }
}

describe('gallery list parsing', () => {
  it('parses table mode and its continuation token', () => {
    const result = parseGalleryList(
      fixture('list-table.html'),
      'https://e-hentai.org/?f_search=test',
    )
    expect(result).toEqual({
      items: [
        {
          gid: '123456',
          token: 'a1b2c3d4e5',
          title: 'Example Gallery',
          link: 'https://e-hentai.org/g/123456/a1b2c3d4e5/',
          imagecount: 42,
        },
      ],
      next: 'next=123456',
    })
  })

  it('parses thumbnail mode', () => {
    expect(
      parseGalleryList(fixture('list-thumbnail.html'), 'https://e-hentai.org/').items[0],
    ).toMatchObject({ gid: '987654', title: 'Thumbnail Gallery', imagecount: 108 })
  })
})

describe('TypeScriptEhentaiService', () => {
  it('falls back from an empty API response and collects all image pages', async () => {
    const request = vi.fn(async (config: AxiosRequestConfig) => {
      if (config.method === 'POST') return response({ gmetadata: [] })
      if (String(config.url).includes('p=1'))
        return response(fixture('gallery-page-2.html'))
      return response(fixture('gallery-page-1.html'))
    })
    const service = new TypeScriptEhentaiService({
      transport: { request } as HttpTransport,
    })

    const metadata = await service.fetchGalleryMetadata(
      'https://e-hentai.org/g/123456/a1b2c3d4e5/',
    )

    expect(metadata).toMatchObject({
      gid: '123456',
      title: 'English Title',
      title_jpn: '日本語題名',
      category: 'Doujinshi',
      filecount: '2',
      count: 2,
      tags: ['artist:example'],
    })
    expect(metadata.image_links).toHaveLength(2)
  })

  it('resolves image pages before downloading bytes', async () => {
    const request = vi.fn(async (config: AxiosRequestConfig) =>
      config.responseType === 'text'
        ? response(fixture('image-page.html'))
        : response(new Uint8Array([1, 2, 3]).buffer, 200, {
            'content-type': 'image/png',
          }),
    )
    const service = new TypeScriptEhentaiService({
      transport: { request } as HttpTransport,
    })
    await service.updateConfig({
      cookies: 'ipb_member_id=42; ipb_pass_hash=secret',
      proxies: [],
    })
    const image = await service.fetchImage('https://e-hentai.org/s/hash/123456-1')

    expect(image.resolvedUrl).toBe('https://a.hath.network/image.jpg')
    expect(image.contentType).toBe('image/png')
    expect([...image.data]).toEqual([1, 2, 3])
    expect(request.mock.calls[0][0].headers).toMatchObject({
      Cookie: 'ipb_member_id=42; ipb_pass_hash=secret',
    })
    expect(request.mock.calls[1][0].headers).not.toHaveProperty('Cookie')
  })

  it('rotates HTTP proxies after a failure and sends a normalized Cookie header', async () => {
    const seen: AxiosRequestConfig[] = []
    const request = vi.fn(async (config: AxiosRequestConfig) => {
      seen.push(config)
      if (seen.length === 1) throw new Error('proxy unavailable')
      return response(fixture('list-table.html'))
    })
    const service = new TypeScriptEhentaiService({
      transport: { request } as HttpTransport,
    })
    await service.updateConfig({
      cookies: JSON.stringify([
        { name: 'ipb_member_id', value: '42' },
        { name: 'ipb_pass_hash', value: 'secret' },
      ]),
      proxies: ['http://first.proxy:8080', 'https://user:pass@second.proxy:8443'],
    })

    await service.fetchPage('https://e-hentai.org/')

    expect(seen.map((config) => config.proxy)).toMatchObject([
      { host: 'first.proxy', port: 8080 },
      { host: 'second.proxy', port: 8443 },
    ])
    expect(seen[1].headers).toMatchObject({
      Cookie: 'ipb_member_id=42; ipb_pass_hash=secret',
    })
  })

  it('forwards AbortSignal to the HTTP transport', async () => {
    const controller = new AbortController()
    const request = vi.fn(async (config: AxiosRequestConfig) => {
      expect(config.signal).toBe(controller.signal)
      return response(fixture('list-table.html'))
    })
    const service = new TypeScriptEhentaiService({
      transport: { request } as HttpTransport,
    })
    await service.fetchPage('https://e-hentai.org/', undefined, controller.signal)
  })

  it('rejects plaintext HTTP before sending session cookies', async () => {
    const request = vi.fn()
    const service = new TypeScriptEhentaiService({
      transport: { request } as HttpTransport,
    })
    await service.updateConfig({ cookies: 'ipb_pass_hash=secret', proxies: [] })

    await expect(service.fetchPage('http://e-hentai.org/')).rejects.toThrow(
      'must use HTTPS',
    )
    expect(request).not.toHaveBeenCalled()
  })
})

describe('normalizeCookieHeader', () => {
  it('also accepts an existing Cookie header', () => {
    expect(normalizeCookieHeader('Cookie: a=1; b=2\n')).toBe('a=1; b=2')
  })
})
