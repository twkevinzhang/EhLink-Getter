import * as fs from 'fs'
import { type Duplex } from 'stream'
import { parser } from 'stream-json'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { streamObject } = require('stream-json/streamers/StreamObject') as {
  streamObject: () => Duplex
}

export class LibraryService {
  private libraryPath: string

  constructor(libraryPath: string) {
    this.libraryPath = libraryPath
  }

  async findLinks(titleQuery: string, limit = 10): Promise<any[]> {
    return this.findMultipleLinks([titleQuery], limit, false)
  }

  async findMultipleLinks(
    queries: string[],
    limit = 1000,
    raw = false,
    filters?: { minRating?: number; includeExpunged?: boolean },
  ): Promise<any[]> {
    if (!fs.existsSync(this.libraryPath)) {
      throw new Error(`Library file not found: ${this.libraryPath}`)
    }

    const results: any[] = []

    const normalizedQueries = queries
      .map((q) => q.trim().toLowerCase())
      .filter((q) => q.length > 0)

    // namespace:value 格式 -> 搜尋 tags；純文字 -> 搜尋 title
    const titleQueries = normalizedQueries.filter((q) => !q.includes(':'))
    const tagQueries = normalizedQueries.filter((q) => q.includes(':'))

    const objStream = streamObject()

    await new Promise<void>((resolve, reject) => {
      objStream.on('data', ({ value: meta }: { value: any }) => {
        if (results.length >= limit) return

        if (!filters?.includeExpunged && meta.expunged) return

        if (filters?.minRating !== undefined && filters.minRating > 0) {
          if (parseFloat(meta.rating || '0') < filters.minRating) return
        }

        const titleLower = (meta.title || '').toLowerCase()
        const tags: string[] = (meta.tags || []).map((t: string) => t.toLowerCase())

        const titleMatch =
          titleQueries.length === 0 || titleQueries.every((q) => titleLower.includes(q))

        const tagMatch =
          tagQueries.length === 0 || tagQueries.every((q) => tags.includes(q))

        if (!titleMatch || !tagMatch) return

        results.push(
          raw
            ? meta
            : {
                title: meta.title,
                link: `https://e-hentai.org/g/${meta.gid}/${meta.token}/`,
              },
        )
      })

      objStream.on('end', resolve)
      objStream.on('error', reject)

      fs.createReadStream(this.libraryPath).pipe(parser()).pipe(objStream)
    })

    return results
  }
}
