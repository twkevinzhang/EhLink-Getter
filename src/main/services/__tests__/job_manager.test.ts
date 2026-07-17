import { describe, expect, it, vi } from 'vitest'
import type { AddToQueuePayload, ManagedGallery } from '@shared/types/api'
import { JobManager } from '../job_manager'

function payload(
  gid = '123',
  targetCollectionIds: string[] = ['collection-a'],
  scheduleId = 'schedule-1',
): AddToQueuePayload {
  return {
    jobId: `job-${gid}`,
    title: `Gallery ${gid}`,
    galleries: [
      {
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
    ],
    origin: 'schedule',
    scheduleId,
    targetCollectionIds,
  }
}

function createWorkspace(downloadsPaused = false) {
  const galleries = new Map<string, ManagedGallery>()
  return {
    galleries,
    loadJobs: vi.fn(() => []),
    saveJobs: vi.fn(),
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

describe('JobManager', () => {
  it('merges collection targets into the active gallery by gid', () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)

    const first = manager.addJob(payload('123', ['collection-a']))
    const merged = manager.addJob({
      ...payload('123', ['collection-b']),
      jobId: 'another-job',
    })

    expect(merged?.jobId).toBe(first?.jobId)
    expect(manager.getJobs()).toHaveLength(1)
    expect(first?.galleries[0].collectionIds).toEqual(['collection-a', 'collection-b'])
  })

  it('creates the managed gallery and collection relation only when download starts', async () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)
    const job = manager.addJob(payload())!
    expect(workspace.upsertGallery).not.toHaveBeenCalled()

    const downloadGallery = vi.fn(async (options: any) => {
      expect(options.targetPath).toBe('/workspace/galleries/123')
      options.onProgress({ progress: 50, status: 'Downloading (1/2)' })
      return { success: true, path: options.targetPath }
    })
    ;(manager as any).downloadService = { downloadGallery }

    await manager.startJob(job.jobId)

    expect(workspace.resolveGalleryPath).toHaveBeenCalledWith('123')
    expect(workspace.upsertGallery).toHaveBeenCalledWith(
      expect.objectContaining({ gid: '123', status: 'downloading' }),
    )
    expect(workspace.addGalleryToCollections).toHaveBeenCalledWith('123', [
      'collection-a',
    ])
    expect(job.galleries[0].targetPath).toBe('/workspace/galleries/123')
    expect(job.mode).toBe('completed')
  })

  it('does not accept downloads before a workspace is configured', () => {
    const manager = new JobManager(null)
    expect(() => manager.addJob(payload())).toThrow('請先設定工作資料夾')
  })

  it('persists a newly discovered schedule job as paused and blocks direct start until resume', async () => {
    const workspace = createWorkspace(true)
    const manager = new JobManager(null, workspace as any)
    const downloadGallery = vi.fn(async () => ({ success: true }))
    ;(manager as any).downloadService = { downloadGallery }

    const job = manager.addJob(payload())!
    await manager.startJob(job.jobId)

    expect(job.mode).toBe('paused')
    expect(job.pausedByScheduleId).toBe('schedule-1')
    expect(job.galleries[0].mode).toBe('paused')
    expect(workspace.upsertGallery).not.toHaveBeenCalled()
    expect(downloadGallery).not.toHaveBeenCalled()
    expect(workspace.saveJobs).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ mode: 'paused' })]),
    )

    workspace.getSchedule.mockReturnValue({
      scheduleId: 'schedule-1',
      downloadsPaused: false,
    })
    manager.resumeScheduleDownloads('schedule-1')
    await vi.waitFor(() => expect(job.mode).toBe('completed'))
    expect(downloadGallery).toHaveBeenCalledOnce()
  })

  it('immediately aborts an owned running job and resumes it later', async () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)
    const job = manager.addJob(payload())!
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

    const running = manager.startJob(job.jobId)
    await vi.waitFor(() => expect(job.mode).toBe('running'))
    workspace.getSchedule.mockReturnValue({
      scheduleId: 'schedule-1',
      downloadsPaused: true,
    })
    manager.pauseScheduleDownloads('schedule-1')
    await running

    expect(wasAborted).toBe(true)
    expect(job.mode).toBe('paused')
    expect(job.pausedByScheduleId).toBe('schedule-1')
    ;(manager as any).downloadService = {
      downloadGallery: vi.fn(async () => ({ success: true })),
    }
    workspace.getSchedule.mockReturnValue({
      scheduleId: 'schedule-1',
      downloadsPaused: false,
    })
    manager.resumeScheduleDownloads('schedule-1')
    await vi.waitFor(() => expect(job.mode).toBe('completed'))
    expect(job.pausedByScheduleId).toBeUndefined()
  })

  it('does not interrupt a running job shared with a manual request', async () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)
    const job = manager.addJob(payload())!
    let finish!: (result: { success: boolean }) => void
    let wasAborted = false
    ;(manager as any).downloadService = {
      downloadGallery: vi.fn(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((resolve) => {
            finish = resolve
            signal.addEventListener('abort', () => {
              wasAborted = true
              resolve({ success: false })
            })
          }),
      ),
    }

    const running = manager.startJob(job.jobId)
    await vi.waitFor(() => expect(job.mode).toBe('running'))
    manager.addJob({
      ...payload(),
      jobId: 'manual-shared',
      origin: 'manual',
      scheduleId: undefined,
    })
    workspace.getSchedule.mockReturnValue({
      scheduleId: 'schedule-1',
      downloadsPaused: true,
    })
    manager.pauseScheduleDownloads('schedule-1')

    expect(job.mode).toBe('running')
    expect(wasAborted).toBe(false)
    finish({ success: true })
    await running
  })

  it('keeps a shared job running while another source schedule still allows downloads', async () => {
    const workspace = createWorkspace()
    const pausedSchedules = new Set<string>()
    workspace.getSchedule.mockImplementation((scheduleId: string) => ({
      scheduleId,
      downloadsPaused: pausedSchedules.has(scheduleId),
    }))
    const manager = new JobManager(null, workspace as any)
    const job = manager.addJob(payload())!
    manager.addJob(payload('123', ['collection-b'], 'schedule-2'))
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

    const running = manager.startJob(job.jobId)
    await vi.waitFor(() => expect(job.mode).toBe('running'))
    pausedSchedules.add('schedule-1')
    manager.pauseScheduleDownloads('schedule-1')

    expect(job.mode).toBe('running')
    expect(wasAborted).toBe(false)
    finish({ success: true })
    await running
  })

  it('pauses a shared job when every source schedule is paused', async () => {
    const workspace = createWorkspace()
    const pausedSchedules = new Set<string>()
    workspace.getSchedule.mockImplementation((scheduleId: string) => ({
      scheduleId,
      downloadsPaused: pausedSchedules.has(scheduleId),
    }))
    const manager = new JobManager(null, workspace as any)
    const job = manager.addJob(payload())!
    manager.addJob(payload('123', ['collection-b'], 'schedule-2'))
    ;(manager as any).downloadService = {
      downloadGallery: vi.fn(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((resolve) => {
            signal.addEventListener('abort', () => {
              resolve({ success: false, error: 'aborted' })
            })
          }),
      ),
    }

    const running = manager.startJob(job.jobId)
    await vi.waitFor(() => expect(job.mode).toBe('running'))
    pausedSchedules.add('schedule-1')
    pausedSchedules.add('schedule-2')
    manager.pauseScheduleDownloads('schedule-1')
    await running

    expect(job.mode).toBe('paused')
    expect(job.pausedByScheduleId).toBe('schedule-1')
  })

  it('automatically starts the merged job when a manual source releases a schedule pause', async () => {
    const workspace = createWorkspace(true)
    const manager = new JobManager(null, workspace as any)
    const job = manager.addJob(payload())!
    ;(manager as any).downloadService = {
      downloadGallery: vi.fn(async () => ({ success: true })),
    }

    const merged = manager.addJob({
      ...payload(),
      jobId: 'manual-request-id',
      origin: 'manual',
      scheduleId: undefined,
    })

    expect(merged?.jobId).toBe(job.jobId)
    await vi.waitFor(() => expect(job.mode).toBe('completed'))
    expect(job.pausedByScheduleId).toBeUndefined()
  })

  it('stops every pending, running, and paused job without restarting jobs after abort', async () => {
    const workspace = createWorkspace()
    const manager = new JobManager(null, workspace as any)
    const runningJob = manager.addJob(payload('123'))!
    const pendingJob = manager.addJob(payload('456'))!
    const pausedJob = manager.addJob(payload('789'))!
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

    const running = manager.startJob(runningJob.jobId)
    await vi.waitFor(() => expect(runningJob.mode).toBe('running'))
    manager.pauseJob(pausedJob.jobId)
    manager.stopAll()
    await running

    expect(wasAborted).toBe(true)
    for (const job of [runningJob, pendingJob, pausedJob]) {
      expect(job).toMatchObject({ mode: 'stopped', status: 'Stopped by user' })
      expect(job.galleries).toEqual(
        expect.arrayContaining([expect.objectContaining({ mode: 'stopped' })]),
      )
    }
    expect((manager as any).downloadService.downloadGallery).toHaveBeenCalledOnce()
  })

  it('resumes more jobs than the concurrency limit as slots become available', async () => {
    const workspace = createWorkspace(true)
    const manager = new JobManager(null, workspace as any)
    const jobs = Array.from(
      { length: 5 },
      (_, index) => manager.addJob(payload(String(100 + index)))!,
    )
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
    expect(jobs.filter((job) => job.mode === 'running')).toHaveLength(3)

    releases.shift()?.()
    await vi.waitFor(() => expect(releases).toHaveLength(3))
    releases.shift()?.()
    await vi.waitFor(() => expect(releases).toHaveLength(3))
    for (const release of releases.splice(0)) release()
    await vi.waitFor(() =>
      expect(jobs.every((job) => job.mode === 'completed')).toBe(true),
    )
  })
})
