import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'vitest'
import type { ScheduleRun } from '../../../shared/types/api'
import { WorkspaceRepository } from '../workspace_repository'

const workspaces: string[] = []

function createRepository(): { repository: WorkspaceRepository; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ehlink-workspace-'))
  workspaces.push(root)
  const repository = new WorkspaceRepository('1.2.3')
  repository.activate(root)
  return { repository, root }
}

function gallery(gid: string, title = `Gallery ${gid}`) {
  return {
    gid,
    token: `token-${gid}`,
    title,
    link: `https://e-hentai.org/g/${gid}/token-${gid}/`,
  }
}

afterEach(() => {
  for (const root of workspaces.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

test('activate initializes every portable workspace file with atomic JSON writes', () => {
  const { repository, root } = createRepository()
  const dataPath = path.join(root, '.ehlink-getter')
  const jsonFiles = [
    'manifest.json',
    'settings.json',
    'gallery-index.json',
    'collections.json',
    'schedules.json',
    'schedule-runs.json',
    'jobs.json',
  ]

  for (const filename of jsonFiles) {
    const filePath = path.join(dataPath, filename)
    assert.equal(fs.existsSync(filePath), true)
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(filePath, 'utf8')))
  }
  assert.equal(fs.existsSync(path.join(dataPath, 'logs.jsonl')), true)
  assert.equal(fs.existsSync(path.join(root, 'galleries')), true)
  assert.deepEqual(
    fs.readdirSync(dataPath).filter((filename) => filename.endsWith('.tmp')),
    [],
  )
  assert.equal(repository.getState().manifest?.appVersion, '1.2.3')
})

test('upsertGallery keeps one managed record per string gid', () => {
  const { repository, root } = createRepository()
  const created = repository.upsertGallery(gallery('123'))
  const updated = repository.upsertGallery({ ...gallery('123', 'Updated'), progress: 42 })

  assert.equal(repository.listGalleries().length, 1)
  assert.equal(updated.createdAt, created.createdAt)
  assert.equal(updated.title, 'Updated')
  assert.equal(updated.progress, 42)
  assert.equal(updated.localPath, path.join(root, 'galleries', '123'))
  assert.equal(fs.existsSync(updated.localPath), true)
})

test('collections are many-to-many and uncategorized remains a dynamic query', () => {
  const { repository } = createRepository()
  repository.upsertGallery(gallery('101'))
  repository.upsertGallery(gallery('202'))
  const favorites = repository.createCollection('Favorites')
  const later = repository.createCollection('Read later')

  assert.deepEqual(
    repository.listUncategorizedGalleries().map((item) => item.gid),
    ['202', '101'],
  )
  assert.deepEqual(repository.addBookToCollections('101', []), { added: 0, existing: 0 })
  assert.deepEqual(
    repository.addBookToCollections('101', [favorites.collectionId, later.collectionId]),
    {
      added: 2,
      existing: 0,
    },
  )
  assert.equal(
    repository.listCollections().filter((item) => item.books[0]?.gid === '101').length,
    2,
  )
  assert.deepEqual(
    repository.listUncategorizedGalleries().map((item) => item.gid),
    ['202'],
  )

  repository.removeBookFromCollection('101', favorites.collectionId)
  repository.removeBookFromCollection('101', later.collectionId)
  assert.equal(repository.isGalleryUncategorized('101'), true)
  assert.equal(
    repository.listCollections().some((item) => item.name === '未分類'),
    false,
  )
})

test('schedule CRUD persists nullable uncategorized targets and execution runs', () => {
  const { repository, root } = createRepository()
  const collection = repository.createCollection('Scheduled')
  const created = repository.createSchedule({
    name: 'non-h',
    monitorUrl: 'https://e-hentai.org/?f_search=non-h',
    cronExpression: '0 */6 * * *',
  })

  assert.equal(created.pageLimit, 3)
  assert.equal(created.targetCollectionId, null)
  assert.equal(created.downloadsPaused, false)
  const schedulesPath = path.join(root, '.ehlink-getter', 'schedules.json')
  const legacySchedules = JSON.parse(fs.readFileSync(schedulesPath, 'utf8'))
  delete legacySchedules[0].downloadsPaused
  fs.writeFileSync(schedulesPath, JSON.stringify(legacySchedules))
  assert.equal(repository.getSchedule(created.scheduleId)?.downloadsPaused, false)
  assert.equal(
    repository.setScheduleDownloadsPaused(created.scheduleId, true).downloadsPaused,
    true,
  )
  assert.equal(repository.getSchedule(created.scheduleId)?.downloadsPaused, true)
  assert.equal(
    repository.setScheduleDownloadsPaused(created.scheduleId, false).downloadsPaused,
    false,
  )
  const updated = repository.updateSchedule(created.scheduleId, {
    pageLimit: 5,
    targetCollectionId: collection.collectionId,
  })
  assert.equal(updated.pageLimit, 5)
  assert.equal(updated.targetCollectionId, collection.collectionId)

  const now = new Date().toISOString()
  const run: ScheduleRun = {
    runId: 'run-1',
    scheduleId: created.scheduleId,
    trigger: 'manual',
    status: 'success',
    snapshot: {
      name: updated.name,
      monitorUrl: updated.monitorUrl,
      canonicalUrl: updated.canonicalUrl,
      query: updated.query,
      cronExpression: updated.cronExpression,
      pageLimit: updated.pageLimit,
      targetCollectionId: updated.targetCollectionId,
    },
    currentPage: 5,
    counters: {
      discovered: 2,
      queued: 1,
      existingGalleryAdded: 1,
      merged: 0,
      ignored: 0,
    },
    startedAt: now,
    updatedAt: now,
    completedAt: now,
  }
  repository.saveScheduleRun(run)
  repository.markScheduleRun(created.scheduleId, 'success', '完成')

  assert.deepEqual(repository.listScheduleRuns(created.scheduleId), [run])
  assert.equal(repository.getSchedule(created.scheduleId)?.lastRunStatus, 'success')
  assert.equal(repository.deleteSchedule(created.scheduleId), true)
  assert.equal(repository.listSchedules().length, 0)
  assert.equal(repository.listScheduleRuns().length, 0)
})
