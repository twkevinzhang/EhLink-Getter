import { defineStore } from 'pinia'
import { ref, computed, watch, toRaw } from 'vue'
import { useLogStore } from './logs'
import { useElectronStorage } from '@renderer/composables/electron-storage'

export interface FetchJob {
  id: string
  link: string
  progress: number
  status: string
  state: 'waiting' | 'fetching' | 'paused'
  currentPage: number
  totalItems: number
  nextToken?: string
  allItems: any[]
}

export const useFetchStore = defineStore('fetch', () => {
  const fetchingJobs = useElectronStorage<FetchJob[]>('fetch.jobs', [])
  const fetchedGalleries = useElectronStorage<any[]>('fetch.galleries', [])

  const activeFetchingJobs = computed(() =>
    fetchingJobs.value.filter((job) => job.progress < 100),
  )

  const logStore = useLogStore()

  function addGallery(url: string, title?: string) {
    const pattern = /^https:\/\/e-hentai\.org\/g\/\d+\/[a-z0-9]+\/?$/
    if (!pattern.test(url)) {
      throw new Error('Invalid E-Hentai gallery URL format')
    }

    if (fetchedGalleries.value.some((g) => g.link === url)) {
      throw new Error('Gallery already in draft list')
    }

    fetchedGalleries.value.unshift({
      id: `manual-${Date.now()}`,
      title:
        title || `Manual Entry: ${url.split('/').filter(Boolean).slice(-2).join('/')}`,
      link: url,
    })
  }

  function removeGallery(galleryId: string) {
    const idx = fetchedGalleries.value.findIndex((g) => g.id === galleryId)
    if (idx !== -1) {
      fetchedGalleries.value.splice(idx, 1)
    }
  }

  function clearGalleries() {
    fetchedGalleries.value = []
    logStore.addLog({
      level: 'info',
      message: 'Draft list cleared manually',
    })
  }

  async function startFetching(
    url: string,
    startPage: number = 1,
    endPage: number = Infinity,
  ) {
    const jobId = Date.now().toString()
    const newJob: FetchJob = {
      id: jobId,
      link: url,
      progress: 0,
      status: 'Starting...',
      state: 'waiting',
      currentPage: startPage - 1,
      totalItems: 0,
      nextToken: startPage > 1 ? (startPage - 1).toString() : undefined,
      allItems: [],
    }
    fetchingJobs.value.unshift(newJob)

    try {
      if (!window.api || !window.api.fetchPage) {
        throw new Error('IPC API not ready')
      }
      console.log('Starting fetching from', url, 'range:', startPage, 'to', endPage)

      let allItems: any[] = []
      let nextToken: string | undefined =
        startPage > 1 ? (startPage - 1).toString() : undefined
      let pageCount = startPage - 1
      let isFirstPage = true

      // Removed aggressive existingJob inheritance that caused loops to skip if previous job finished

      const jobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId)
      if (jobIdx === -1) return

      fetchingJobs.value[jobIdx].state = 'fetching'
      fetchingJobs.value[jobIdx].allItems = allItems
      fetchingJobs.value[jobIdx].nextToken = nextToken
      fetchingJobs.value[jobIdx].currentPage = pageCount

      while (isFirstPage || nextToken) {
        pageCount++
        const currentJobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId)
        if (currentJobIdx === -1) break

        if (fetchingJobs.value[currentJobIdx].state === 'paused') {
          fetchingJobs.value[currentJobIdx].nextToken = nextToken
          fetchingJobs.value[currentJobIdx].allItems = JSON.parse(
            JSON.stringify(allItems),
          )
          fetchingJobs.value[currentJobIdx].currentPage = pageCount - 1
          fetchingJobs.value[currentJobIdx].totalItems = allItems.length
          return
        }

        if (pageCount > endPage) {
          logStore.addLog({
            level: 'info',
            message: `Reached end page limit (${endPage}).`,
          })
          break
        }

        fetchingJobs.value[currentJobIdx].status =
          `Fetching page ${pageCount}... (Found ${allItems.length})`
        fetchingJobs.value[currentJobIdx].progress = Math.min(
          endPage === Infinity
            ? pageCount * 2
            : ((pageCount - startPage + 1) / (endPage - startPage + 1 || 1)) * 100,
          95,
        )
        fetchingJobs.value[currentJobIdx].currentPage = pageCount
        fetchingJobs.value[currentJobIdx].totalItems = allItems.length

        const result = await window.api.fetchPage({ url, next: nextToken })

        if (result && result.items) {
          allItems = [...allItems, ...result.items]
          nextToken = result.next
          isFirstPage = false
          fetchingJobs.value[currentJobIdx].allItems = allItems
          fetchingJobs.value[currentJobIdx].nextToken = nextToken
        } else {
          break
        }
        if (!nextToken) break
      }

      const finalJobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId)
      if (finalJobIdx !== -1) {
        const job = fetchingJobs.value[finalJobIdx]
        job.progress = 100
        job.status = `Finished: ${allItems.length} items found`
        job.state = 'waiting'

        const newGalleries = allItems.map((item: any, idx: number) => ({
          id: `${jobId}-${idx}`,
          title: item.title,
          link: item.link,
          sourceJob: job.link,
        }))

        fetchedGalleries.value = [...newGalleries, ...fetchedGalleries.value]

        logStore.addLog({
          level: 'info',
          message: `Added ${newGalleries.length} items to draft from fetch job ${jobId}`,
        })
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error)
      const errorJobIdx = fetchingJobs.value.findIndex((j) => j.id === jobId)
      if (errorJobIdx !== -1) {
        fetchingJobs.value[errorJobIdx].status = `Error: ${message}`
        fetchingJobs.value[errorJobIdx].state = 'paused'
      }
    }
  }

  async function pauseFetching(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId)
    if (job && job.state === 'fetching') {
      job.state = 'paused'
      logStore.addLog({
        level: 'info',
        message: `Pausing fetch job: ${jobId}`,
      })
    }
  }

  async function resumeFetching(jobId: string) {
    const job = fetchingJobs.value.find((j) => j.id === jobId)
    if (!job || job.state !== 'paused') return

    try {
      if (!window.api || !window.api.fetchPage) throw new Error('IPC API not ready')
      job.state = 'fetching'
      let nextToken = job.nextToken
      let allItems = [...job.allItems]
      let pageCount = job.currentPage

      while (nextToken || pageCount === 0) {
        pageCount++
        if ((job.state as any) === 'paused') {
          job.nextToken = nextToken
          job.allItems = JSON.parse(JSON.stringify(allItems))
          job.currentPage = pageCount - 1
          return
        }
        job.status = `Fetching page ${pageCount}... (Found ${allItems.length})`
        job.progress = Math.min(pageCount * 5, 95)
        const result = await window.api.fetchPage({
          url: job.link,
          next: nextToken,
        })
        if (result && result.items) {
          allItems = [...allItems, ...result.items]
          nextToken = result.next
          job.allItems = allItems
          job.nextToken = nextToken
          job.currentPage = pageCount
          job.totalItems = allItems.length
        } else {
          break
        }
        if (!nextToken) break
      }

      job.progress = 100
      job.status = `Finished: ${allItems.length} items found`
      job.state = 'waiting'

      const newGalleries = allItems.map((item: any, idx: number) => ({
        id: `${jobId}-${idx}`,
        title: item.title,
        link: item.link,
        sourceJob: job.link,
      }))

      fetchedGalleries.value = [...newGalleries, ...fetchedGalleries.value]
    } catch (error: any) {
      job.status = `Error: ${error.message}`
      job.state = 'paused'
    }
  }

  async function deleteFetchingJob(jobId: string) {
    const index = fetchingJobs.value.findIndex((j) => j.id === jobId)
    if (index !== -1) {
      fetchingJobs.value.splice(index, 1)
      logStore.addLog({
        level: 'info',
        message: `Deleted fetch job: ${jobId}`,
      })
    }
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
  }
})
