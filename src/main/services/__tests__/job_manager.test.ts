import { describe, expect, it, vi } from 'vitest'
import type { AddToQueuePayload, ManagedGallery } from '@shared/types/api'
import { JobManager } from '../job_manager'

function payload(
  gid = '123',
  targetCollectionIds: string[] = ['collection-a'],
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
    targetCollectionIds,
  }
}

function createWorkspace() {
  const galleries = new Map<string, ManagedGallery>()
  return {
    galleries,
    loadJobs: vi.fn(() => []),
    saveJobs: vi.fn(),
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
})
