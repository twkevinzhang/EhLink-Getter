import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useLogStore } from '@renderer/stores/logs'
import { useElectronStorage } from '@renderer/composables/electron-storage'
import { plainValue } from '@renderer/utilities'
import type { FetchedItem } from '@shared/types/api'

export interface FetchJob {
  jobId: string
  link: string
  progress: number
  status: string
  state: 'waiting' | 'fetching' | 'paused'
  currentPage: number
  totalItems: number
  nextToken?: string
  allItems: FetchedItem[]
}

export interface DraftGallery {
  gid: string
  title: string
  link: string
  token?: string
  sourceJob?: string
  imageCount?: number
}

export const useFetchStore = defineStore('fetch', () => {
  const fetchingJobs = useElectronStorage<FetchJob[]>('fetch.jobs', [])
  const fetchedGalleries = useElectronStorage<DraftGallery[]>('fetch.galleries', [])
  const logStore = useLogStore()

  const activeFetchingJobs = computed(() =>
    fetchingJobs.value.filter((job) => job.progress < 100),
  )

  let _idCounter = 0
  function generateJobId(): string {
    return `${Date.now()}-${++_idCounter}`
  }

  function _appendGalleries(jobId: string, sourceLink: string, items: FetchedItem[]) {
    const newGalleries: DraftGallery[] = items.map((item, idx) => ({
      gid: item.gid || `${jobId}-${idx}`,
      title: item.title,
      link: item.link,
      token: item.token,
      sourceJob: sourceLink,
    }))
    fetchedGalleries.value = [...newGalleries, ...fetchedGalleries.value]
    logStore.addLog({
      level: 'info',
      message: `Added ${newGalleries.length} items to draft from job ${jobId}`,
    })
  }

  async function _runFetchLoop(
    jobId: string,
    startToken: string | undefined,
    startPage: number,
    endPage: number,
    accumulatedItems: FetchedItem[],
  ) {
    let nextToken = startToken
    let allItems = [...accumulatedItems]
    let pageCount = startPage

    const getJob = () => fetchingJobs.value.find((j) => j.jobId === jobId)

    while (true) {
      const job = getJob()
      if (!job) break

      if (job.state === 'paused') {
        job.nextToken = nextToken
        job.allItems = plainValue(allItems)
        job.currentPage = pageCount
        job.totalItems = allItems.length
        return
      }

      if (pageCount > endPage) {
        logStore.addLog({
          level: 'info',
          message: `Reached end page limit (${endPage}).`,
        })
        break
      }

      job.status = `Fetching page ${pageCount}... (Found ${allItems.length})`
      job.progress = Math.min(
        endPage === Infinity
          ? pageCount * 2
          : ((pageCount - (startPage - 1)) / (endPage - (startPage - 1) || 1)) * 100,
        95,
      )
      job.currentPage = pageCount
      job.totalItems = allItems.length

      const result = await window.api.fetchPage(
        plainValue({ url: job.link, next: nextToken }),
      )
      console.log('result', JSON.stringify(result, null, 2))

      if (!result?.items) break

      allItems = [...allItems, ...result.items]
      nextToken = result.next
      job.allItems = allItems
      job.nextToken = nextToken
      pageCount++

      if (!nextToken) break
    }

    const job = getJob()
    if (job) {
      job.progress = 100
      job.status = `Finished: ${allItems.length} items found`
      job.state = 'waiting'
      _appendGalleries(jobId, job.link, allItems)
    }
  }

  async function startFetching(url: string, startPage = 1, endPage = Infinity) {
    const jobId = generateJobId()
    const initialToken = startPage > 1 ? (startPage - 1).toString() : undefined

    fetchingJobs.value.unshift({
      jobId,
      link: url,
      progress: 0,
      status: 'Starting...',
      state: 'fetching',
      currentPage: startPage,
      totalItems: 0,
      nextToken: initialToken,
      allItems: [],
    })

    try {
      await _runFetchLoop(jobId, initialToken, startPage, endPage, [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const job = fetchingJobs.value.find((j) => j.jobId === jobId)
      if (job) {
        job.status = `Error: ${message}`
        job.state = 'paused'
      }
    }
  }

  async function pauseFetching(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.jobId === jobId)
    if (job?.state === 'fetching') {
      job.state = 'paused'
      logStore.addLog({ level: 'info', message: `Pausing fetch job: ${jobId}` })
    }
  }

  async function resumeFetching(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.jobId === jobId)
    if (!job || job.state !== 'paused') return

    job.state = 'fetching'
    try {
      await _runFetchLoop(jobId, job.nextToken, job.currentPage, Infinity, [
        ...job.allItems,
      ])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      job.status = `Error: ${message}`
      job.state = 'paused'
    }
  }

  async function deleteFetchingJob(jobId: string) {
    const index = fetchingJobs.value.findIndex((j) => j.jobId === jobId)
    if (index !== -1) {
      fetchingJobs.value.splice(index, 1)
      logStore.addLog({ level: 'info', message: `Deleted fetch job: ${jobId}` })
    }
  }

  function addGallery(url: string, title?: string) {
    const pattern = /^https:\/\/e-hentai\.org\/g\/\d+\/[a-z0-9]+\/?$/
    if (!pattern.test(url)) throw new Error('Invalid E-Hentai gallery URL format')
    if (fetchedGalleries.value.some((g) => g.link === url))
      throw new Error('Gallery already in draft list')

    fetchedGalleries.value.unshift({
      gid: `manual-${generateJobId()}`,
      title:
        title || `Manual Entry: ${url.split('/').filter(Boolean).slice(-2).join('/')}`,
      link: url,
    })
  }

  function removeGallery(gid: string) {
    const idx = fetchedGalleries.value.findIndex((g) => g.gid === gid)
    if (idx !== -1) fetchedGalleries.value.splice(idx, 1)
  }

  function clearGalleries() {
    fetchedGalleries.value = []
    logStore.addLog({ level: 'info', message: 'Draft list cleared manually' })
  }

  async function selectDirectory() {
    const response = await window.api.selectDirectory()
    return response.path
  }

  async function selectSavePath() {
    const response = await window.api.selectSavePath()
    return response.path
  }

  return {
    fetchingJobs,
    galleries: fetchedGalleries,
    activeFetchingJobs,
    startFetching,
    pauseFetching,
    resumeFetching,
    deleteFetchingJob,
    clearGalleries,
    addGallery,
    removeGallery,
    selectDirectory,
    selectSavePath,
  }
})
