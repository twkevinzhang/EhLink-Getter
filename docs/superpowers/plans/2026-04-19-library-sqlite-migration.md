# Library SQLite Migration 實作計劃書

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 Library 搜尋後端從 stream-json 線性掃描改為 SQLite + FTS5 trigram，並在下載後自動執行匯入流程，全程顯示分階段進度 UI。

**Architecture:** 下載完 `library.json` 後，在 Node.js Worker Thread 中執行 SQLite 匯入（batch insert + 延後建 index），避免阻塞 Electron 主執行緒。主執行緒透過 `library-progress` IPC push event 即時更新 UI 三個階段（下載、匯入、建索引）。搜尋改由 `LibrarySqliteService` 直接 query `library.db`。

**Tech Stack:** `better-sqlite3`（同步 SQLite）、`stream-json@1`（JSON streaming 解析）、Node.js `worker_threads`、electron-vite（multi-entry build）、PrimeVue ProgressBar

---

## ⚠️ 最佳實踐警告（實作前必讀）

以下是此類任務最常犯的錯誤，請逐一確認：

1. **`better-sqlite3` 是同步 API，絕對不可以在 Electron 主執行緒直接執行長時間操作**（import / FTS rebuild 各需 10–60 秒）。所有 SQLite 操作必須在 Worker Thread 中執行。
2. **PRAGMA 安全機制關閉後必須還原**。`PRAGMA synchronous = OFF` 在 import 結束後必須還原為 `NORMAL`，`journal_mode = OFF` 還原為 `WAL`，否則資料庫損壞風險極高。
3. **import 失敗時必須刪除不完整的 `.db` 檔案**。若 worker 中途 crash，下次啟動 `check-library-exists` 會看到一個損壞的 DB 並誤以為已完成。
4. **FTS5 content table 的 rebuild 必須在所有資料插入完畢後才執行**：`INSERT INTO galleries_fts(galleries_fts) VALUES('rebuild')`。不要邊插入邊更新 FTS，那樣會極慢。
5. **SQL 絕對不可以使用字串拼接**。永遠使用 `db.prepare(sql).run(params)` 或 `.get(params)`，param 以 `?` 佔位。
6. **Worker Thread 的 JS 檔案不能放在 asar 封存中**（打包後 worker 無法被 `new Worker(path)` 載入）。必須在 `electron-builder.json5` 的 `asarUnpack` 中列出。
7. **`checkLibraryExists` 必須檢查 DB 的 `_meta` 表中 `status = 'ready'`**，不可只檢查檔案是否存在（存在可能代表上次 import 失敗的殘留檔案）。
8. **`tags_text` 欄位儲存時前後要加空格**：`" language:chinese male:glasses "`。搜尋時用 `instr(tags_text, ' language:chinese ')` 而非 `LIKE '%language:chinese%'`，避免被其他 tag 子字串誤判。
9. **空關鍵字搜尋不可使用 FTS**（FTS5 `MATCH ''` 會報錯）。當 keywords 為空時，直接 `SELECT * FROM galleries WHERE ...` 加 filter 即可。
10. **`electron-vite` 多入口設定**：worker 檔案必須在 `electron.vite.config.ts` 的 `main.build.rollupOptions.input` 中獨立列出，否則 `out/main/library_import_worker.js` 不會被產生。

---

## 檔案異動地圖

| 動作     | 檔案                                          | 說明                                                                       |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| **新增** | `src/main/workers/library_import_worker.ts`   | Worker Thread：stream-json 讀取 → SQLite batch insert → FTS rebuild        |
| **新增** | `src/main/services/library_sqlite_service.ts` | 搜尋服務：`better-sqlite3` query                                           |
| **修改** | `src/main/services/utilties.ts`               | 新增 `libraryDbPath()`                                                     |
| **修改** | `src/main/index.ts`                           | 更新 `download-library`、`check-library-exists`、`search-library` handlers |
| **刪除** | `src/main/services/library_service.ts`        | 被 worker + sqlite service 取代                                            |
| **修改** | `src/shared/types/api.ts`                     | 新增 `LibraryProgressEvent`，更新相關 interface                            |
| **修改** | `src/preload/index.ts`                        | 新增 `onLibraryProgress` listener，移除 `onDownloadProgress`               |
| **修改** | `src/renderer/src/stores/library.ts`          | 新增 `phase`、`importProgress`，替換 progress listener                     |
| **修改** | `src/renderer/src/views/Library.vue`          | 三階段進度 UI                                                              |
| **修改** | `electron.vite.config.ts`                     | 新增 worker 多入口                                                         |
| **修改** | `electron-builder.json5`                      | `asarUnpack` 加入 worker JS                                                |

---

## Task 1：安裝依賴並設定 Electron Rebuild

**Files:**

- Modify: `package.json`
- Modify: `electron.vite.config.ts`
- Modify: `electron-builder.json5`

- [ ] **Step 1：安裝 better-sqlite3**

```bash
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

- [ ] **Step 2：確認 better-sqlite3 能在 Electron 中正常執行**

在 macOS/Windows 開發環境，`better-sqlite3` 是 native addon，需要用 Electron 版本的 Node.js 重新編譯。執行：

```bash
npx electron-rebuild -f -w better-sqlite3
```

若成功，終端機會顯示 `✓ Rebuild Complete`。若失敗，先確認 Python 和 node-gyp 已安裝。

- [ ] **Step 3：在 `electron.vite.config.ts` 新增 worker 多入口**

讀取現有檔案再修改。目前 `main` 區塊沒有 `build` 設定，需要加上：

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
      },
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          library_import_worker: resolve('src/main/workers/library_import_worker.ts'),
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [
      vue(),
      Components({
        resolvers: [PrimeVueResolver()],
      }),
    ],
  },
})
```

- [ ] **Step 4：在 `electron-builder.json5` 新增 asarUnpack**

```json5
{
  appId: 'dev.twkevinzhang.ehlinkgetter',
  productName: 'EhLink-Getter',
  directories: { output: 'dist/electron' },
  files: [
    'out/**/*',
    'package.json',
    { from: 'node_modules', to: 'node_modules', filter: ['**/*'] },
  ],
  asar: true,
  asarUnpack: [
    'resources/sidecar/**',
    'out/main/library_import_worker.js', // ← 新增：worker 不能在 asar 中
  ],
  extraResources: [{ from: 'dist/sidecar', to: 'sidecar', filter: ['**/*'] }],
  win: { target: ['portable'] },
  mac: { target: ['dmg', 'zip'] },
  publish: [{ provider: 'github', owner: 'twkevinzhang', repo: 'EhLink-Getter' }],
}
```

- [ ] **Step 5：commit**

```bash
git add electron.vite.config.ts electron-builder.json5 package.json pnpm-lock.yaml
git commit -m "chore(library): install better-sqlite3 and configure worker build entry"
```

---

## Task 2：型別定義更新

**Files:**

- Modify: `src/shared/types/api.ts`

- [ ] **Step 1：在 `src/shared/types/api.ts` 找到 Library 模組區段，新增以下型別並修改現有型別**

新增 `LibraryProgressEvent`（三階段進度事件），修改 `CheckLibraryExistsResponse` 和 `SidecarAPI`：

在 `CheckLibraryExistsResponse` 之前新增：

```typescript
/** library-progress IPC push event */
export interface LibraryProgressEvent {
  phase: 'download' | 'import' | 'index'
  /** 0-100。index 階段：開始為 0，完成為 100 */
  progress: number
}
```

修改 `CheckLibraryExistsResponse`（移除 `success`，只留 `exists`，因為 handler 永遠不會 throw）：

```typescript
export interface CheckLibraryExistsResponse {
  exists: boolean
}
```

在 `SidecarAPI` 的 library 區段，將 `onDownloadProgress` 替換為 `onLibraryProgress`：

```typescript
// library
searchLibrary: (payload: SearchLibraryPayload) => Promise<SearchLibraryResponse>
checkLibraryExists: () => Promise<CheckLibraryExistsResponse>
downloadLibrary: () => Promise<DownloadLibraryResponse>
onLibraryProgress: (callback: (data: LibraryProgressEvent) => void) => void
openFolder: (path?: string) => Promise<void>
```

- [ ] **Step 2：type check**

```bash
pnpm run typecheck
```

預期出現型別錯誤（因為 preload / store 尚未更新），這是正常的。只要確認 `src/shared/types/api.ts` 本身沒有語法錯誤即可。

---

## Task 3：utilities 新增 `libraryDbPath`

**Files:**

- Modify: `src/main/services/utilties.ts`

- [ ] **Step 1：新增 `libraryDbPath` function**

讀取現有 `utilties.ts`，在 `libraryPath()` 之後新增：

```typescript
export function libraryDbPath() {
  return join(app.getPath('userData'), 'library.db')
}
```

完整檔案應為：

```typescript
import { app } from 'electron'
import { join } from 'path'

export function configPath() {
  return join(app.getPath('userData'), 'config.json')
}

export function libraryPath() {
  return join(app.getPath('userData'), 'library.json')
}

export function libraryDbPath() {
  return join(app.getPath('userData'), 'library.db')
}

export function downloadsPath() {
  return join(app.getPath('userData'), 'downloads')
}

export function userData() {
  return app.getPath('userData')
}
```

---

## Task 4：建立 Worker Thread（最重要）

**Files:**

- Create: `src/main/workers/library_import_worker.ts`

Worker 負責三件事：

1. 用 `stream-json` streaming 讀取 `library.json`，batch insert 到 SQLite
2. 建立 B-tree indexes
3. 執行 `INSERT INTO galleries_fts(galleries_fts) VALUES('rebuild')` 建 FTS5 index

Worker 透過 `parentPort.postMessage()` 回報進度，透過 `workerData` 接收參數。

- [ ] **Step 1：建立目錄並建立檔案**

```bash
mkdir -p src/main/workers
```

建立 `src/main/workers/library_import_worker.ts`：

```typescript
import { workerData, parentPort } from 'worker_threads'
import * as fs from 'fs'
import Database from 'better-sqlite3'
import { parser } from 'stream-json'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { streamObject } = require('stream-json/streamers/StreamObject') as {
  streamObject: () => import('stream').Duplex
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
    } catch (_) {
      /* already closed */
    }
  }
}

run().catch((err) => {
  // Worker 錯誤會透過 worker.on('error') 傳回主執行緒
  throw err
})
```

- [ ] **Step 2：確認 type check（只針對 node）**

```bash
pnpm run typecheck:node
```

預期通過（此時 index.ts 尚未改動）。

---

## Task 5：建立 `LibrarySqliteService`

**Files:**

- Create: `src/main/services/library_sqlite_service.ts`

這個 service 負責搜尋，純粹是 SELECT query，不負責匯入。

- [ ] **Step 1：建立檔案**

```typescript
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
    const hasTagQuery = tagQueries.length > 0

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
```

---

## Task 6：更新 IPC Handlers

**Files:**

- Modify: `src/main/index.ts`

需要修改三個 handler：`download-library`、`check-library-exists`、`search-library`。
同時在 `src/main/index.ts` 頂部更新 import。

- [ ] **Step 1：更新 import 區段**

在 `src/main/index.ts` 頂部，找到現有的 import：

```typescript
import { LibraryService } from '@main/services/library_service'
import { downloadsPath, libraryPath } from '@main/services/utilties'
```

替換為：

```typescript
import { Worker } from 'worker_threads'
import path from 'path'
import { LibrarySqliteService } from '@main/services/library_sqlite_service'
import { downloadsPath, libraryPath, libraryDbPath } from '@main/services/utilties'
import type { LibraryProgressEvent } from '@shared/types/api'
```

同時移除 `SearchLibraryPayload`、`SearchLibraryResponse` 等已不再需要在 handler 中手動 import 的型別（視現有 import 而調整）。

- [ ] **Step 2：替換 `check-library-exists` handler**

找到現有的 handler：

```typescript
ipcMain.handle('check-library-exists', async (): Promise<CheckLibraryExistsResponse> => {
  try {
    const exists = fs.existsSync(libraryPath())
    return { success: true, exists }
  } catch (error: any) {
    return { success: false, exists: false }
  }
})
```

替換為：

```typescript
ipcMain.handle('check-library-exists', async (): Promise<CheckLibraryExistsResponse> => {
  try {
    const dbPath = libraryDbPath()
    if (!fs.existsSync(dbPath)) return { exists: false }

    // ⚠️ 只有 _meta.status = 'ready' 才算真正完成（排除 import 中途失敗的殘留）
    const db = new (require('better-sqlite3'))(dbPath, { readonly: true })
    try {
      const row = db.prepare(`SELECT value FROM _meta WHERE key = 'status'`).get() as
        | { value: string }
        | undefined
      return { exists: row?.value === 'ready' }
    } finally {
      db.close()
    }
  } catch {
    return { exists: false }
  }
})
```

- [ ] **Step 3：替換 `download-library` handler**

找到現有的 `ipcMain.handle('download-library', ...)` 並完整替換：

```typescript
ipcMain.handle('download-library', async (): Promise<DownloadLibraryResponse> => {
  const url = 'https://mega.nz/folder/oh1U0SIA#WBUcf3PaOvrfIF238fnbTg'
  const jsonPath = libraryPath()
  const dbPath = libraryDbPath()

  const sendProgress = (event: LibraryProgressEvent) => {
    mainWindow?.webContents.send('library-progress', event)
  }

  try {
    // ── Phase 1：下載 library.json ────────────────────────────
    const folder = MegaFile.fromURL(url)
    await folder.loadAttributes()

    // @ts-ignore
    const file = folder.children.find((f: any) => f.name === 'gdata.json')
    if (!file) throw new Error('File gdata.json not found in the MEGA folder')

    await new Promise<void>((resolve, reject) => {
      const stream = file.download({})
      const writeStream = fs.createWriteStream(jsonPath)

      stream.on('progress', (info: { bytesLoaded: number; bytesTotal: number }) => {
        const progress =
          info.bytesTotal > 0 ? Math.round((info.bytesLoaded / info.bytesTotal) * 100) : 0
        sendProgress({ phase: 'download', progress })
      })

      stream.pipe(writeStream)
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
      stream.on('error', reject)
    })

    // ── Phase 2 & 3：Worker Thread 執行 SQLite 匯入與建索引 ───
    // ⚠️ Worker 路徑：electron-vite build 後 worker 與 index.js 同目錄（out/main/）
    const workerPath = path.join(__dirname, 'library_import_worker.js')

    await new Promise<void>((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: { jsonPath, dbPath },
      })

      worker.on('message', (msg: LibraryProgressEvent) => {
        sendProgress(msg)
      })

      worker.on('error', reject)

      worker.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Library import worker exited with code ${code}`))
      })
    })

    return { success: true, path: dbPath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
```

- [ ] **Step 4：替換 `search-library` handler**

找到現有 `ipcMain.handle('search-library', ...)` 並替換：

```typescript
ipcMain.handle(
  'search-library',
  async (_, payload: SearchLibraryPayload): Promise<SearchLibraryResponse> => {
    try {
      const dbPath = libraryDbPath()
      const service = new LibrarySqliteService(dbPath)

      try {
        const keywords = payload.keywords
          .split(' ')
          .map((q) => q.trim().toLowerCase())
          .filter((q) => q.length > 0)

        const titleTokens = keywords.filter((q) => !q.includes(':'))
        const tagQueries = keywords.filter((q) => q.includes(':'))

        const results = service.search(titleTokens, tagQueries, {
          minRating: payload.minRating,
          includeExpunged: payload.includeExpunged,
        })

        return { results }
      } finally {
        service.close()
      }
    } catch (error: any) {
      return { results: [], error: error.message }
    }
  },
)
```

- [ ] **Step 5：type check**

```bash
pnpm run typecheck:node
```

修正所有型別錯誤後繼續。

---

## Task 7：更新 Preload

**Files:**

- Modify: `src/preload/index.ts`

- [ ] **Step 1：替換 `onDownloadProgress` 為 `onLibraryProgress`**

找到：

```typescript
onDownloadProgress: (callback: (data: { loaded: number; total: number }) => void) =>
  ipcRenderer.on('download-progress', (_event, value) => callback(value)),
```

替換為：

```typescript
onLibraryProgress: (callback: (data: LibraryProgressEvent) => void) =>
  ipcRenderer.on('library-progress', (_event, value) => callback(value)),
```

同時在 import 區段加入 `LibraryProgressEvent`：

```typescript
import {
  type SidecarAPI,
  type AppConfig,
  type SearchLibraryPayload,
  type FetchedItem,
  type ArchiveProgressEvent,
  type SidecarLogEvent,
  type FetchGalleryResponse,
  type AddToQueuePayload,
  type DownloadJobUpdatedEvent,
  type LibraryProgressEvent, // ← 新增
} from '@shared/types/api'
```

---

## Task 8：更新 Pinia Store

**Files:**

- Modify: `src/renderer/src/stores/library.ts`

- [ ] **Step 1：完整替換 `src/renderer/src/stores/library.ts`**

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  LibraryGallery,
  SearchLibraryPayload,
  LibraryProgressEvent,
} from '@shared/types/api'
import { plainValue } from '@renderer/utilities'

export const useLibraryStore = defineStore('library', () => {
  const galleries = ref<LibraryGallery[]>([])
  const isLibraryReady = ref(false)
  const isProcessing = ref(false) // download 或 import 進行中
  const phase = ref<LibraryProgressEvent['phase'] | null>(null)
  const progress = ref(0)
  const searching = ref(false)
  const error = ref<string | null>(null)
  let progressListenerInitialized = false

  async function checkLibraryExists() {
    try {
      const result = await window.api.checkLibraryExists()
      isLibraryReady.value = result.exists
    } catch (err: unknown) {
      console.error('[LibraryStore] checkLibraryExists failed:', err)
    }
  }

  async function downloadLibrary() {
    try {
      isProcessing.value = true
      phase.value = 'download'
      progress.value = 0
      error.value = null

      const result = await window.api.downloadLibrary()

      if (result.success) {
        isLibraryReady.value = true
        return { success: true }
      }

      error.value = result.error ?? 'Unknown error'
      return { success: false, error: result.error }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      return { success: false, error: message }
    } finally {
      isProcessing.value = false
      phase.value = null
      progress.value = 0
    }
  }

  async function searchLibrary(
    keywords: string,
    filters?: { minRating?: number; includeExpunged?: boolean },
  ) {
    if (!isLibraryReady.value) {
      return { success: false, error: 'Library not ready' }
    }
    try {
      searching.value = true
      const payload: SearchLibraryPayload = {
        keywords,
        fields: [], // LibrarySqliteService 不使用 fields，保留欄位維持型別相容
        ...(filters?.minRating !== undefined && { minRating: filters.minRating }),
        ...(filters?.includeExpunged !== undefined && {
          includeExpunged: filters.includeExpunged,
        }),
      }
      const response = await window.api.searchLibrary(plainValue(payload))
      if (response?.error) {
        return { success: false, error: response.error }
      }
      galleries.value = response?.results ?? []
      return { success: true, count: galleries.value.length }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    } finally {
      searching.value = false
    }
  }

  function initProgressEventListener() {
    if (progressListenerInitialized) return
    progressListenerInitialized = true

    window.api.onLibraryProgress((data: LibraryProgressEvent) => {
      phase.value = data.phase
      progress.value = data.progress
      if (!isProcessing.value) isProcessing.value = true
    })
  }

  return {
    galleries,
    isLibraryReady,
    isProcessing,
    phase,
    progress,
    searching,
    error,
    checkLibraryExists,
    downloadLibrary,
    searchLibrary,
    initProgressEventListener,
  }
})
```

---

## Task 9：更新 Library.vue

**Files:**

- Modify: `src/renderer/src/views/Library.vue`

- [ ] **Step 1：更新 `<script setup>` 區段**

`isLibraryDownloaded` → `isLibraryReady`，`downloading` → `isProcessing`。新增 `phaseLabel` computed。

```typescript
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useLibraryStore } from '@renderer/stores/library'

const toast = useToast()
const libraryStore = useLibraryStore()

const searchTag = ref('')
const ratings = ref(0)
const expunged = ref(false)
const first = ref(0)
const pageSize = 50

const paginatedGalleries = computed(() =>
  libraryStore.galleries.slice(first.value, first.value + pageSize),
)

// 三個 phase 對應的顯示文字
const phaseLabel = computed(() => {
  switch (libraryStore.phase) {
    case 'download':
      return '正在從 MEGA 下載 library.json...'
    case 'import':
      return '正在匯入資料庫...'
    case 'index':
      return '正在建立搜尋索引...'
    default:
      return ''
  }
})

// index phase 使用不確定進度條（因無法精確預估）
const isIndeterminate = computed(() => libraryStore.phase === 'index')

onMounted(() => {
  libraryStore.checkLibraryExists()
  libraryStore.initProgressEventListener()
})

const handleDownloadMetadata = async () => {
  const result = await libraryStore.downloadLibrary()
  if (result.success) {
    toast.add({
      severity: 'success',
      summary: 'Success',
      detail: '資料庫建立完成！',
      life: 3000,
    })
  } else {
    toast.add({ severity: 'error', summary: '失敗', detail: result.error, life: 5000 })
  }
}

const handleSearch = async () => {
  if (libraryStore.searching) return
  if (!libraryStore.isLibraryReady) {
    toast.add({
      severity: 'warn',
      summary: 'Warning',
      detail: 'Please download library first',
      life: 3000,
    })
    return
  }
  const result = await libraryStore.searchLibrary(searchTag.value, {
    minRating: ratings.value || undefined,
    includeExpunged: expunged.value,
  })
  first.value = 0
  if (result.success) {
    toast.add({
      severity: 'success',
      summary: 'Done',
      detail: `Found ${result.count} results`,
      life: 3000,
    })
  } else {
    toast.add({
      severity: 'error',
      summary: 'Search Failed',
      detail: result.error,
      life: 5000,
    })
  }
}

const handleOpenLink = (link: string) => window.api.openFolder(link)

const getCategoryClass = (cat: string | undefined) => {
  const c = (cat || '').toLowerCase()
  if (c.includes('doujinshi')) return 'bg-eh-cat-doujinshi'
  if (c.includes('manga')) return 'bg-eh-cat-manga'
  if (c.includes('artist')) return 'bg-eh-cat-artistcg'
  if (c.includes('game')) return 'bg-eh-cat-gamecg'
  if (c.includes('non-h')) return 'bg-eh-cat-non-h'
  if (c.includes('cosplay')) return 'bg-eh-cat-cosplay'
  return 'bg-gray-500'
}

const formatPosted = (ts: string | number | undefined) => {
  if (!ts) return 'Unknown date'
  const n = typeof ts === 'number' ? ts : parseInt(String(ts), 10)
  return isNaN(n) ? String(ts) : new Date(n * 1000).toLocaleString()
}
```

- [ ] **Step 2：更新 `<template>` 的下載按鈕與進度條區段**

找到 `download-section` div，替換為：

```html
<div class="download-section flex flex-col gap-2">
  <button
    type="button"
    icon="pi pi-download"
    :disabled="libraryStore.isLibraryReady || libraryStore.isProcessing"
    :loading="libraryStore.isProcessing"
    class="w-full !h-12 !font-bold"
    :label="libraryStore.isLibraryReady ? 'Library Database Ready' : 'Download & Build Library'"
    @click="handleDownloadMetadata"
  />

  <div v-if="libraryStore.isProcessing" class="mt-2">
    <div class="flex justify-between text-xs mb-1 text-eh-muted">
      <span>{{ phaseLabel }}</span>
      <span v-if="!isIndeterminate">{{ libraryStore.progress }}%</span>
    </div>
    <ProgressBar
      :value="isIndeterminate ? undefined : libraryStore.progress"
      :mode="isIndeterminate ? 'indeterminate' : 'determinate'"
      class="!h-2"
    >
      <template #default><span></span></template>
    </ProgressBar>
  </div>
</div>
```

- [ ] **Step 3：更新 template 中所有 `isLibraryDownloaded` → `isLibraryReady`**

在 template 中搜尋所有 `libraryStore.isLibraryDownloaded` 並替換為 `libraryStore.isLibraryReady`（共出現 3 處）。

- [ ] **Step 4：type check**

```bash
pnpm run typecheck
```

全部通過後繼續。

---

## Task 10：刪除舊檔案、最終驗證與 commit

**Files:**

- Delete: `src/main/services/library_service.ts`

- [ ] **Step 1：刪除已被取代的 `library_service.ts`**

```bash
rm src/main/services/library_service.ts
```

- [ ] **Step 2：確認 type check 全部通過**

```bash
pnpm run typecheck
```

應全數通過，無任何錯誤。

- [ ] **Step 3：啟動開發伺服器手動測試**

```bash
pnpm run dev
```

測試流程：

1. 點擊「Download & Build Library」按鈕
2. 確認進度條依序顯示「正在從 MEGA 下載...」→「正在匯入資料庫...」→「正在建立搜尋索引...」
3. 完成後按鈕顯示「Library Database Ready」
4. 搜尋 `10114`，應能找到 `[Pixiv] ﾏｷﾑﾗｼｭﾝｽｹ(10114)`
5. 搜尋 `language:chinese`，應能找到語言為中文的圖庫
6. 搜尋 `ｷﾑﾗ`（日文片假名子字串），應能找到包含此字串的 title（trigram 驗證）

- [ ] **Step 4：最終 commit**

```bash
git add -A
git commit -m "feat(library): migrate search backend to SQLite FTS5 with three-phase progress UI"
```

---

## 常見錯誤排查

### Worker 路徑找不到

**症狀：** `Error: Cannot find module '.../library_import_worker.js'`
**原因：** electron-vite 沒有把 worker 當作獨立 entry build
**解法：** 確認 `electron.vite.config.ts` 的 `main.build.rollupOptions.input` 有列出 `library_import_worker`，重新執行 `pnpm run dev`

### better-sqlite3 版本不相容

**症狀：** `Error: The module '...better_sqlite3.node' was compiled against a different Node.js version`
**解法：** 執行 `npx electron-rebuild -f -w better-sqlite3`

### FTS5 trigram 搜尋無結果

**症狀：** 中文/日文子字串搜尋找不到
**原因：** trigram 需要至少 3 個字元才能建 index
**解法：** 搜尋字串至少 3 個字元；若只有 1–2 個字元，直接用 `LIKE` fallback

### import 進度卡在 99%

**症狀：** 進度條停在 99% 很久
**說明：** 這是正常現象，99% 代表 batch insert 完成，之後正在執行 FTS rebuild（30–60 秒，不確定進度，UI 已切換為 indeterminate mode）
