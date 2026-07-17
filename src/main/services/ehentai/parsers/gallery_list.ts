import { load, type CheerioAPI } from 'cheerio'

import type { FetchPageItem, FetchPageResponse } from '../types'

const GALLERY_PATTERN = /\/g\/(\d+)\/([a-z0-9]+)/i
const PAGE_COUNT_PATTERN = /(\d+)\s+pages?/i
const TOKEN_KEYS = ['next', 'jump', 'page', 'from', 'prev'] as const

export function extractGalleryIdentity(url: string): { gid: string; token: string } {
  const match = url.match(GALLERY_PATTERN)
  if (!match) throw new Error(`Invalid gallery URL: ${url}`)
  return { gid: match[1], token: match[2] }
}

function imageCount(text: string): number {
  const match = text.match(PAGE_COUNT_PATTERN)
  return match ? Number(match[1]) : 0
}

export function extractPaginationToken(
  href: string,
  baseUrl: string,
): string | undefined {
  try {
    const url = new URL(href, baseUrl)
    for (const key of TOKEN_KEYS) {
      const value = url.searchParams.get(key)
      if (value) return `${key}=${value}`
    }
  } catch {
    return undefined
  }
  return undefined
}

function findNext($: CheerioAPI, baseUrl: string): string | undefined {
  let token: string | undefined
  $('a').each((_, element) => {
    if (token) return
    const link = $(element)
    const text = link.text().trim().toLowerCase()
    const id = link.attr('id')
    if (
      id === 'dnext' ||
      text === '>' ||
      text === '»' ||
      text.includes('next') ||
      (link.hasClass('ptp') && text === '>')
    ) {
      const href = link.attr('href')
      if (href) token = extractPaginationToken(href, baseUrl)
    }
  })

  if (!token) {
    const href = $('table.ptt td.ptds').next().find('a').first().attr('href')
    if (href) token = extractPaginationToken(href, baseUrl)
  }
  return token
}

export function parseGalleryList(html: string, baseUrl: string): FetchPageResponse {
  const $ = load(html)
  const items: FetchPageItem[] = []

  $('table.itg tr').each((_, row) => {
    const glink = $(row).find('div.glink').first()
    if (!glink.length) return
    const anchor = glink.closest('a')
    const href = anchor.attr('href')
    if (!href) return
    try {
      const identity = extractGalleryIdentity(href)
      items.push({
        ...identity,
        title: glink.text().trim(),
        link: new URL(href, baseUrl).toString(),
        imagecount: imageCount($(row).text()),
      })
    } catch {
      // Search/tag links are not galleries.
    }
  })

  if (items.length === 0) {
    $('div.gl1t').each((_, element) => {
      const root = $(element)
      const anchor = root.find('div.gl2t a').first().length
        ? root.find('div.gl2t a').first()
        : root.find('a').first()
      const href = anchor.attr('href')
      if (!href) return
      try {
        const identity = extractGalleryIdentity(href)
        items.push({
          ...identity,
          title: (anchor.attr('title') || anchor.text()).trim(),
          link: new URL(href, baseUrl).toString(),
          imagecount: imageCount(root.text()),
        })
      } catch {
        // Ignore unrelated links in thumbnail cards.
      }
    })
  }

  return { items, next: findNext($, baseUrl) }
}

export function applyPaginationToken(url: string, token?: string): string {
  if (!token) return url
  const parsed = new URL(url)
  const separator = token.indexOf('=')
  if (separator >= 0) {
    parsed.searchParams.set(token.slice(0, separator), token.slice(separator + 1))
  } else if (/^\d+$/.test(token)) {
    parsed.searchParams.set('page', token)
  } else {
    parsed.searchParams.set('next', token)
  }
  return parsed.toString()
}
