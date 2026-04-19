import { workerData, parentPort } from 'worker_threads'
import * as fs from 'fs'
import Database from 'better-sqlite3'
import { parser } from 'stream-json'

import type { Duplex } from 'stream'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { streamObject } = require('stream-json/streamers/StreamObject') as {
  streamObject: () => Duplex
}

interface WorkerInput {
  jsonPath: string
  dbPath: string
}

interface ProgressMessage {
  phase: 'import' | 'index'
  progress: number // 0-100
}

const BATCH_SIZE = 10_000
const ESTIMATED_TOTAL = 1_200_000

function sendProgress(phase: ProgressMessage['phase'], progress: number) {
  parentPort!.postMessage({ phase, progress } satisfies ProgressMessage)
}

async function run() {
  const { jsonPath, dbPath } = workerData as WorkerInput

  // 若上次失敗有殘留，先刪除
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }

  const db = new Database(dbPath)

  try {
    // ── 1. 建立 schema ────────────────────────────────────────
    db.exec(`
      CREATE TABLE galleries (
        gid       INTEGER PRIMARY KEY,
        token     TEXT    NOT NULL,
        title     TEXT    NOT NULL,
        category  TEXT    NOT NULL DEFAULT '',
        thumb     TEXT    NOT NULL DEFAULT '',
        uploader  TEXT    NOT NULL DEFAULT '',
        posted    INTEGER NOT NULL DEFAULT 0,
        rating    REAL    NOT NULL DEFAULT 0,
        expunged  INTEGER NOT NULL DEFAULT 0,
        tags_text TEXT    NOT NULL DEFAULT ''
      );
      CREATE TABLE _meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)

    // ── 2. 匯入期間關閉安全機制（大幅提升寫入速度）────────────
    // ⚠️ 務必在 finally 中還原
    db.pragma('journal_mode = OFF')
    db.pragma('synchronous = OFF')
    db.pragma('temp_store = MEMORY')
    db.pragma('cache_size = -524288') // 512 MB

    // ── 3. Batch INSERT ────────────────────────────────────────
    const insertStmt = db.prepare(`
      INSERT INTO galleries
        (gid, token, title, category, thumb, uploader, posted, rating, expunged, tags_text)
      VALUES
        (@gid, @token, @title, @category, @thumb, @uploader, @posted, @rating, @expunged, @tags_text)
    `)

    // ⚠️ db.transaction() 回傳一個函式，呼叫它才真正執行
    const insertBatch = db.transaction((rows: object[]) => {
      for (const row of rows) {
        insertStmt.run(row)
      }
    })

    let buffer: object[] = []
    let totalInserted = 0

    await new Promise<void>((resolve, reject) => {
      const objStream = streamObject()

      objStream.on('data', ({ value: meta }: { value: any }) => {
        // tags_text：前後加空格方便 instr 精確匹配
        // e.g. " language:chinese male:glasses "
        const tagsArray: string[] = Array.isArray(meta.tags) ? meta.tags : []
        const tags_text = tagsArray.length > 0 ? ` ${tagsArray.join(' ')} ` : ''

        buffer.push({
          gid: meta.gid,
          token: meta.token ?? '',
          title: meta.title ?? '',
          category: meta.category ?? '',
          thumb: meta.thumb ?? '',
          uploader: meta.uploader ?? '',
          posted:
            typeof meta.posted === 'string'
              ? parseInt(meta.posted, 10)
              : (meta.posted ?? 0),
          rating:
            typeof meta.rating === 'string'
              ? parseFloat(meta.rating)
              : (meta.rating ?? 0),
          expunged: meta.expunged ? 1 : 0,
          tags_text,
        })

        if (buffer.length >= BATCH_SIZE) {
          insertBatch(buffer)
          totalInserted += buffer.length
          buffer = []
          // 回報進度（用已插入筆數 / 估計總數）
          const progress = Math.min(
            Math.round((totalInserted / ESTIMATED_TOTAL) * 100),
            99,
          )
          sendProgress('import', progress)
        }
      })

      objStream.on('end', () => {
        // 插入剩餘不足一個 batch 的資料
        if (buffer.length > 0) {
          insertBatch(buffer)
          totalInserted += buffer.length
          buffer = []
        }
        resolve()
      })

      objStream.on('error', reject)
      fs.createReadStream(jsonPath).pipe(parser()).pipe(objStream)
    })

    sendProgress('import', 100)

    // ── 4. 延後建 B-tree indexes ──────────────────────────────
    // ⚠️ 先插入資料再建 index，比邊插入邊維護快很多
    db.exec(`
      CREATE INDEX idx_rating   ON galleries(rating);
      CREATE INDEX idx_expunged ON galleries(expunged);
    `)

    // ── 5. 還原安全機制，建 FTS5 index ───────────────────────
    // ⚠️ FTS rebuild 需要 journal，先還原 journal_mode
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')

    sendProgress('index', 0)

    // ⚠️ 這行是同步的，約需 30-60 秒，這也是為什麼要用 Worker Thread
    db.exec(`
      CREATE VIRTUAL TABLE galleries_fts USING fts5(
        title,
        content      = 'galleries',
        content_rowid = 'gid',
        tokenize     = 'trigram'
      );
    `)
    // rebuild 將 galleries 的 title 填入 FTS index
    db.exec(`INSERT INTO galleries_fts(galleries_fts) VALUES('rebuild')`)

    // ── 6. 寫入完成標記 ────────────────────────────────────────
    db.prepare(`INSERT INTO _meta (key, value) VALUES ('status', 'ready')`).run()

    sendProgress('index', 100)
  } catch (err) {
    db.close()
    // ⚠️ 失敗時刪除不完整的 DB，下次重新來過
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath)
    }
    throw err
  } finally {
    // ⚠️ 確保 DB 總是被關閉
    try {
      db.close()
    } catch {
      /* already closed */
    }
  }
}

run().catch((err) => {
  // Worker 錯誤會透過 worker.on('error') 傳回主執行緒
  throw err
})
