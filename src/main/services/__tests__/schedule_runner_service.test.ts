import { describe, expect, it, vi } from 'vitest'
import type { FetchedItem, Schedule } from '@shared/types/api'
import { ScheduleRunnerService } from '../schedule_runner_service'

const item = (gid: string): FetchedItem => ({
  gid,
  token: `token-${gid}`,
  title: `Gallery ${gid}`,
  link: `https://e-hentai.org/g/${gid}/token-${gid}/`,
  imagecount: 10,
})

const schedule: Schedule = {
  scheduleId: 'schedule-1',
  name: '每日更新',
  monitorUrl: 'https://e-hentai.org/tag/chinese',
  canonicalUrl: 'https://e-hentai.org/tag/chinese',
  query: 'tag:chinese',
  cronExpression: '0 */6 * * *',
  pageLimit: 3,
  targetCollectionId: 'collection-1',
  enabled: true,
  downloadsPaused: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function createWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    getSchedule: vi.fn(() => schedule),
    getSettings: vi.fn(() => ({ isArchive: false, archivePassword: '' })),
    getGallery: vi.fn(() => undefined),
    addGalleryToCollections: vi.fn(() => ({ added: 1, existing: 0 })),
    saveScheduleRun: vi.fn(),
    markScheduleRun: vi.fn(),
    ...overrides,
  }
}

describe('ScheduleRunnerService', () => {
  it('persists and applies schedule-level download pause and resume', () => {
    const paused = { ...schedule, downloadsPaused: true }
    const resumed = { ...schedule, downloadsPaused: false }
    const workspace = createWorkspace({
      setScheduleDownloadsPaused: vi
        .fn()
        .mockReturnValueOnce(paused)
        .mockReturnValueOnce(resumed),
    })
    const jobManager = {
      pauseScheduleDownloads: vi.fn(),
      resumeScheduleDownloads: vi.fn(),
    }
    const runner = new ScheduleRunnerService(workspace as any, jobManager as any)

    expect(runner.pauseDownloads(schedule.scheduleId)).toEqual(paused)
    expect(jobManager.pauseScheduleDownloads).toHaveBeenCalledWith(schedule.scheduleId)
    expect(runner.resumeDownloads(schedule.scheduleId)).toEqual(resumed)
    expect(jobManager.resumeScheduleDownloads).toHaveBeenCalledWith(schedule.scheduleId)
  })

  it('scans up to pageLimit, deduplicates real gids and queues unknown galleries', async () => {
    const workspace = createWorkspace()
    const jobs: any[] = []
    const jobManager = {
      getJobs: vi.fn(() => jobs),
      addJob: vi.fn((payload) => {
        const job = { ...payload, mode: 'pending' }
        jobs.push(job)
        return job
      }),
      startJob: vi.fn(),
    }
    const api = {
      fetchPage: vi
        .fn()
        .mockResolvedValueOnce({ items: [item('101'), item('101')], next: 'page=1' })
        .mockResolvedValueOnce({ items: [item('102')], next: 'page=2' })
        .mockResolvedValueOnce({ items: [item('103')], next: 'page=3' }),
    }
    const runner = new ScheduleRunnerService(
      workspace as any,
      jobManager as any,
      () => api,
    )

    const run = await runner.run(schedule.scheduleId, 'manual')

    expect(api.fetchPage).toHaveBeenCalledTimes(3)
    expect(run.counters).toMatchObject({ discovered: 3, queued: 3 })
    expect(jobManager.addJob).toHaveBeenCalledTimes(3)
    expect(jobManager.startJob).toHaveBeenCalledTimes(3)
    expect(workspace.getGallery).toHaveBeenCalledWith('101')
  })

  it('adds an existing gid to the target collection without re-downloading', async () => {
    const workspace = createWorkspace({
      getGallery: vi.fn(() => ({ gid: '456' })),
    })
    const jobManager = { getJobs: vi.fn(() => []), addJob: vi.fn(), startJob: vi.fn() }
    const api = { fetchPage: vi.fn().mockResolvedValue({ items: [item('456')] }) }
    const runner = new ScheduleRunnerService(
      workspace as any,
      jobManager as any,
      () => api,
    )

    const run = await runner.run(schedule.scheduleId, 'manual')

    expect(run.counters.existingGalleryAdded).toBe(1)
    expect(workspace.addGalleryToCollections).toHaveBeenCalledWith('456', [
      'collection-1',
    ])
    expect(jobManager.addJob).not.toHaveBeenCalled()
  })

  it('keeps an existing categorized gallery unchanged when target is Uncategorized', async () => {
    const uncategorized = { ...schedule, targetCollectionId: null }
    const workspace = createWorkspace({
      getSchedule: vi.fn(() => uncategorized),
      getGallery: vi.fn(() => ({ gid: '789' })),
    })
    const jobManager = { getJobs: vi.fn(() => []), addJob: vi.fn(), startJob: vi.fn() }
    const api = { fetchPage: vi.fn().mockResolvedValue({ items: [item('789')] }) }
    const runner = new ScheduleRunnerService(
      workspace as any,
      jobManager as any,
      () => api,
    )

    const run = await runner.run(schedule.scheduleId, 'manual')

    expect(run.counters.ignored).toBe(1)
    expect(workspace.addGalleryToCollections).not.toHaveBeenCalled()
    expect(jobManager.addJob).not.toHaveBeenCalled()
  })
})
