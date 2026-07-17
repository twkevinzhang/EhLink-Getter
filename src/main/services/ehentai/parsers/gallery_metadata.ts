import { load } from 'cheerio'

import type { GalleryMetadata } from '../types'
import { extractGalleryIdentity } from './gallery_list'

function emptyMetadata(url: string): GalleryMetadata {
  const { gid, token } = extractGalleryIdentity(url)
  return {
    gid,
    token,
    title: '',
    title_jpn: '',
    category: '',
    thumb: '',
    uploader: '',
    posted: '',
    filecount: '0',
    filesize: 0,
    expunged: false,
    rating: '',
    torrentcount: '0',
    tags: [],
    image_links: [],
    count: 0,
  }
}

function backgroundImage(style?: string): string {
  return style?.match(/url\((?:['"])?([^'")]+)(?:['"])?\)/i)?.[1] ?? ''
}

export function parseGalleryMetadataPage(
  html: string,
  url: string,
): { metadata: GalleryMetadata; nextPage?: string } {
  const $ = load(html)
  const metadata = emptyMetadata(url)
  metadata.title = $('#gn').first().text().trim()
  metadata.title_jpn = $('#gj').first().text().trim()
  metadata.category = $('div#gdc div').first().text().trim()
  metadata.uploader = $('div#gdn a').first().text().trim()
  metadata.thumb =
    $('#gd1 img').first().attr('src') ||
    backgroundImage($('#gd1 div').first().attr('style'))

  $('#taglist tr').each((_, row) => {
    const namespace = $(row).find('td.tc').text().trim().replace(/:$/, '')
    $(row)
      .find('div.gt, div.gtl')
      .each((__, tag) => {
        const name = $(tag).text().trim()
        if (name) metadata.tags.push(namespace ? `${namespace}:${name}` : name)
      })
  })

  $('div#gdt a').each((_, anchor) => {
    const href = $(anchor).attr('href')
    if (href?.includes('/s/')) metadata.image_links.push(new URL(href, url).toString())
  })

  const details = $('#gdd').text()
  metadata.posted = details.match(/Posted:\s*([^\n]+)/i)?.[1]?.trim() ?? ''
  metadata.filecount = details.match(/Length:\s*(\d+)/i)?.[1] ?? '0'
  metadata.rating = $('#rating_label')
    .text()
    .replace(/^Average:\s*/i, '')
    .trim()
  metadata.expunged = /expunged/i.test($('body').text())
  metadata.count = metadata.image_links.length

  const nextHref = $('table.ptt td.ptds').next().find('a').first().attr('href')
  return {
    metadata,
    nextPage: nextHref ? new URL(nextHref, url).toString() : undefined,
  }
}

export function normalizeApiMetadata(raw: unknown, expectedUrl: string): GalleryMetadata {
  if (!raw || typeof raw !== 'object') throw new Error('Metadata API returned no gallery')
  const value = raw as Record<string, unknown>
  const expected = extractGalleryIdentity(expectedUrl)
  const gid = String(value.gid ?? '')
  const token = String(value.token ?? '')
  if (!gid || !token || gid !== expected.gid || token !== expected.token) {
    throw new Error('Metadata API returned a mismatched gallery')
  }

  return {
    gid,
    token,
    title: String(value.title ?? ''),
    title_jpn: String(value.title_jpn ?? ''),
    category: String(value.category ?? ''),
    thumb: String(value.thumb ?? ''),
    uploader: String(value.uploader ?? ''),
    posted: String(value.posted ?? ''),
    filecount: String(value.filecount ?? '0'),
    filesize: Number(value.filesize ?? 0),
    expunged: Boolean(value.expunged),
    rating: String(value.rating ?? ''),
    torrentcount: String(value.torrentcount ?? '0'),
    tags: Array.isArray(value.tags) ? value.tags.map(String) : [],
    image_links: [],
    count: Number(value.filecount ?? 0),
  }
}
