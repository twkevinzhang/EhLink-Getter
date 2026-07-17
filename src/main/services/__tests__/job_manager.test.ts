import { describe, expect, it, vi } from 'vitest'
import type { AddToQueueItemPayload, ManagedGallery } from '@shared/types/api'
import { JobManager } from '../job_manager'

function payload(
  gid = '123',
  targetCollectionIds: string[] = ['collection-a'],
  scheduleId = 'schedule-1',
): AddToQueueItemPayload {
  return {
    queueItemId: `item-${gid}`,
    gallery: {
      gid,
      token: 'abc123',
      title: `Gallery ${gid}`,
      link: `https://e-hentai.org/g/${gid}/abc123/`,
      targetPath: '/caller-controlled/path',
      isArchive: false,
      imagecount: 2,
      status: 'Pending',
      progress: 0,
      mode: 'pending',
    },
    origin: 'schedule',
    scheduleId,
    targetCollectionIds,
  }
}

function createWorkspace(downloadsPaused = false) {
  const galleries = new Map<string, ManagedGallery>()
  return {
    galleries,
    loadQueueItems: vi.fn(() => []),
    saveQueueItems: vi.fn(),
    getSchedule: vi.fn((scheduleId: string) => ({ scheduleId, downloadsPaused })),
    resolveGalleryPath: vi.fn((gid: string) => `/workspace/galleries/${gid}`),
    getGallery: vi.fn((gid: string) => galleries.get(String(gid))),
    upsertGallery: vi.fn((input: any) => {
      const now = new Date().toISOString()
      const gallery = {
        ...input,
        token: input.token ?? '',
        localPath: `/workspace/galleries/${input.gid}`,
        status: input.status ?? 'downloading',
        progress: input.progress ?? 0,
        createdAt: now,
        updatedAt: now,
      } as ManagedGallery
      galleries.set(input.gid, gallery)
      return gallery
    }),
    updateGalleryStatus: vi.fn((gid: string, status: any, patch: any) => {
      const gallery = galleries.get(String(gid))!
      Object.assign(gallery, patch, { status })
      return gallery
    }),
    addGalleryToCollections: vi.fn(() => ({ added: 1, existing: 0 })),
  }
}

describe('JobManager flat queue', () => {
  it('merges collection targets and sources into the active item by gid', () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)

    const first = manager.addQueueItem(payload('123', ['collection-a']))
    const merged = manager.addQueueItem({
      ...payload('123', ['collection-b'], 'schedule-2'),
      queueItemId: 'another-item',
    })

    expect(merged?.queueItemId).toBe(first?.queueItemId)
    expect(manager.getQueueItems()).toHaveLength(1)
    expect(first?.collectionIds).toEqual(['collection-a', 'collection-b'])
    expect(first?.sourceScheduleIds).toEqual(['schedule-1', 'schedule-2'])
  })

  it('creates the managed gallery only when the queue item starts', async () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)
    const item = manager.addQueueItem(payload())!
    expect(workspace.upsertGallery).not.toHaveBeenCalled()

    const downloadGallery = vi.fn(async (options: any) => {
      expect(options.targetPath).toBe('/workspace/galleries/123')
      options.onProgress({ progress: 50, status: 'Downloading (1/2)' })
      return { success: true, path: options.targetPath }
    })
    ;(manager as any).downloadService = { downloadGallery }

    await manager.startQueueItem(item.queueItemId)

    expect(workspace.upsertGallery).toHaveBeenCalledWith(
      expect.objectContaining({ gid: '123', status: 'downloading' }),
    )
    expect(workspace.addGalleryToCollections).toHaveBeenCalledWith('123', [
      'collection-a',
    ])
    expect(item.targetPath).toBe('/workspace/galleries/123')
    expect(item).toMatchObject({ mode: 'completed', progress: 100 })
  })

  it('does not accept downloads before a workspace is configured', () => {
    const manager = new JobManager(null)
    expect(() => manager.addQueueItem(payload())).toThrow('請先設定工作資料夾')
  })

  it('persists a schedule item as paused and resumes it when allowed', async () => {
    const workspace = createWorkspace(true)
    const manager = new JobManager(null, workspace as any)
    const downloadGallery = vi.fn(async () => ({ success: true }))
    ;(manager as any).downloadService = { downloadGallery }

    const item = manager.addQueueItem(payload())!
    await manager.startQueueItem(item.queueItemId)
    expect(item).toMatchObject({ mode: 'paused', pausedByScheduleId: 'schedule-1' })
    expect(downloadGallery).not.toHaveBeenCalled()

    workspace.getSchedule.mockReturnValue({
      scheduleId: 'schedule-1',
      downloadsPaused: false,
    })
    manager.resumeScheduleDownloads('schedule-1')
    await vi.waitFor(() => expect(item.mode).toBe('completed'))
    expect(downloadGallery).toHaveBeenCalledOnce()
  })

  it('keeps an item running when a manual source is merged', async () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)
    const item = manager.addQueueItem(payload())!
    let finish!: (result: { success: boolean }) => void
    let wasAborted = false
    ;(manager as any).downloadService = {
      downloadGallery: vi.fn(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((resolve) => {
            finish = resolve
            signal.addEventListener('abort', () => {
              wasAborted = true
              resolve({ success: false, error: 'aborted' })
            })
          }),
      ),
    }

    const running = manager.startQueueItem(item.queueItemId)
    await vi.waitFor(() => expect(item.mode).toBe('running'))
    manager.addQueueItem({
      ...payload(),
      queueItemId: 'manual-shared',
      origin: 'manual',
      scheduleId: undefined,
    })
    workspace.getSchedule.mockReturnValue({
      scheduleId: 'schedule-1',
      downloadsPaused: true,
    })
    manager.pauseScheduleDownloads('schedule-1')

    expect(item.mode).toBe('running')
    expect(wasAborted).toBe(false)
    finish({ success: true })
    await running
  })

  it('stops every active queue item without restarting after abort', async () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)
    const runningItem = manager.addQueueItem(payload('123'))!
    const pendingItem = manager.addQueueItem(payload('456'))!
    const pausedItem = manager.addQueueItem(payload('789'))!
    let wasAborted = false
    ;(manager as any).downloadService = {
      downloadGallery: vi.fn(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((resolve) => {
            signal.addEventListener('abort', () => {
              wasAborted = true
              resolve({ success: false, error: 'aborted' })
            })
          }),
      ),
    }

    const running = manager.startQueueItem(runningItem.queueItemId)
    await vi.waitFor(() => expect(runningItem.mode).toBe('running'))
    manager.pauseQueueItem(pausedItem.queueItemId)
    manager.stopAll()
    await running

    expect(wasAborted).toBe(true)
    for (const item of [runningItem, pendingItem, pausedItem]) {
      expect(item).toMatchObject({ mode: 'stopped', status: 'Stopped by user' })
    }
    expect((manager as any).downloadService.downloadGallery).toHaveBeenCalledOnce()
  })

  it('marks an item as error when the downloader throws unexpectedly', async () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)
    const item = manager.addQueueItem(payload())!
    ;(manager as any).downloadService = {
      downloadGallery: vi.fn(async () => {
        throw new Error('network failed')
      }),
    }

    await manager.startQueueItem(item.queueItemId)

    expect(item).toMatchObject({ mode: 'error', status: 'network failed' })
    expect(workspace.updateGalleryStatus).toHaveBeenCalledWith(
      '123',
      'error',
      expect.objectContaining({ error: 'network failed' }),
    )
  })

  it('waits for an aborted run to exit before restarting the same item', async () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)
    const item = manager.addQueueItem(payload())!
    let secondRunAborted = false
    let callCount = 0
    const downloadGallery = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<{ success: false; error: string }>((resolve) => {
          callCount++
          signal.addEventListener('abort', () => {
            if (callCount === 2) secondRunAborted = true
            resolve({ success: false, error: 'aborted' })
          })
        }),
    )
    ;(manager as any).downloadService = { downloadGallery }

    const firstRun = manager.startQueueItem(item.queueItemId)
    await vi.waitFor(() => expect(item.mode).toBe('running'))
    const restarted = manager.restartQueueItem(item.queueItemId)

    await vi.waitFor(() => expect(downloadGallery).toHaveBeenCalledTimes(2))
    expect(item.mode).toBe('running')
    manager.stopQueueItem(item.queueItemId)
    await Promise.all([firstRun, restarted])

    expect(secondRunAborted).toBe(true)
    expect(item.mode).toBe('stopped')
    expect(downloadGallery).toHaveBeenCalledTimes(2)
  })

  it('uses new slots as running items complete', async () => {
    const workspace = createWorkspace(true)
    const manager = new JobManager(null, workspace as any)
    const items = Array.from({ length: 5 }, (_, index) =>
      manager.addQueueItem(payload(String(100 + index))),
    ) as NonNullable<ReturnType<JobManager['addQueueItem']>>[]
    const releases: Array<() => void> = []
    ;(manager as any).downloadService = {
      downloadGallery: vi.fn(
        () =>
          new Promise((resolve) => {
            releases.push(() => resolve({ success: true }))
          }),
      ),
    }

    workspace.getSchedule.mockReturnValue({
      scheduleId: 'schedule-1',
      downloadsPaused: false,
    })
    manager.resumeScheduleDownloads('schedule-1')
    await vi.waitFor(() => expect(releases).toHaveLength(3))
    expect(items.filter((item) => item.mode === 'running')).toHaveLength(3)

    releases.shift()?.()
    await vi.waitFor(() => expect(releases).toHaveLength(3))
    releases.shift()?.()
    await vi.waitFor(() => expect(releases).toHaveLength(3))
    for (const release of releases.splice(0)) release()
    await vi.waitFor(() =>
      expect(items.every((item) => item.mode === 'completed')).toBe(true),
    )
  })
})
