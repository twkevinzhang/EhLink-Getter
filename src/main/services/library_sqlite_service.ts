import Database from 'better-sqlite3'
import type { LibraryGallery } from '@shared/types/api'

export class LibrarySqliteService {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true })
    this.db.pragma('cache_size = -51200') // 50 MB read cache
  }

  close() {
    this.db.close()
  }

  /**
   * 搜尋 galleries。
   * - titleTokens：純文字 query，透過 FTS5 trigram 搜尋 title 子字串
   * - tagQueries：namespace:value 格式，透過 instr(tags_text, ...) 精確匹配
   * - 當 titleTokens 與 tagQueries 皆為空時，回傳全部（套用 filter）
   */
  search(
    titleTokens: string[],
    tagQueries: string[],
    filters: { minRating?: number; includeExpunged?: boolean },
    limit = 1000,
  ): LibraryGallery[] {
    const hasTitleQuery = titleTokens.length > 0

    // FTS5 MATCH 語法：多個 token 用 AND 連接，每個用雙引號包住（trigram phrase match）
    // e.g. '"pixiv" AND "tobari"'
    const ftsMatchStr = titleTokens.map((t) => `"${t.replace(/"/g, '')}"`).join(' AND ')

    // 動態組 WHERE 條件（不含 SQL injection 風險，因為 params 走 ? 佔位）
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (hasTitleQuery) {
      // FTS5 subquery：取得符合 title 的 gid
      conditions.push(
        `g.gid IN (SELECT rowid FROM galleries_fts WHERE galleries_fts MATCH ?)`,
      )
      params.push(ftsMatchStr)
    }

    for (const tag of tagQueries) {
      // ⚠️ tags_text 儲存為 " tag1 tag2 "，搜尋時加空格確保精確匹配
      conditions.push(`instr(g.tags_text, ?) > 0`)
      params.push(` ${tag} `)
    }

    if (!filters.includeExpunged) {
      conditions.push(`g.expunged = 0`)
    }

    if (filters.minRating !== undefined && filters.minRating > 0) {
      conditions.push(`g.rating >= ?`)
      params.push(filters.minRating)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const sql = `
      SELECT g.gid, g.token, g.title, g.category, g.thumb,
             g.uploader, g.posted, g.rating, g.expunged, g.tags_text
      FROM galleries g
      ${whereClause}
      LIMIT ?
    `
    params.push(limit)

    const rows = this.db.prepare(sql).all(...params) as any[]

    return rows.map((row) => {
      // tags_text 還原為 string[]，去除前後空格後 split
      const tags = row.tags_text ? row.tags_text.trim().split(' ').filter(Boolean) : []

      // 從 tags 中提取 language
      const langTag = tags.find((t: string) => t.startsWith('language:'))
      const language = langTag ? langTag.replace('language:', '') : undefined

      return {
        gid: String(row.gid),
        token: row.token,
        title: row.title,
        category: row.category || undefined,
        thumb: row.thumb || undefined,
        uploader: row.uploader || undefined,
        posted: row.posted || undefined,
        rating: String(row.rating),
        expunged: row.expunged === 1,
        tags,
        language,
        link: `https://e-hentai.org/g/${row.gid}/${row.token}/`,
      } satisfies LibraryGallery
    })
  }
}
