import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useConfigStore } from './config'
import { useLogStore } from './logs'

export interface DownloadGallery {
  id: string
  title: string
  link: string
  targetPath: string
  isArchive: boolean
  imageCount: number
  status: string
  progress: number
  mode: 'running' | 'paused' | 'error' | 'completed' | 'pending'
  password?: string
}

export interface DownloadJob {
  id: string
  title: string
  progress: number
  status: string
  mode: 'running' | 'paused' | 'error' | 'completed' | 'pending'
  galleries: DownloadGallery[]
  isExpanded?: boolean
  isArchive?: boolean
  password?: string
  archiveProgress?: number
  isArchiving?: boolean
}

export const useDownloadStore = defineStore('download', () => {
  const downloadingJobs = ref<DownloadJob[]>([])
  const completedTasks = ref<any[]>([])
  const libraryGalleries = ref<any[]>([])
  const configStore = useConfigStore()
  const logStore = useLogStore()

  function parsePath(template: string, gallery: any) {
    const idMatch = gallery.link.match(/\/g\/(\d+)\//)
    const id = idMatch ? idMatch[1] : 'unknown'

    let path = template
    if (!path || path.trim() === '') {
      path = 'output/{EN_TITLE}'
    }

    // Traditional Strategy Logic and general placeholder replacement:
    const enTitle = gallery.title
    const jpTitle = gallery.title

    path = path.replace(/{ID}/g, id)
    path = path.replace(/{EN_TITLE}/g, enTitle)
    path = path.replace(/{JP_TITLE}/g, jpTitle)

    return path
  }

  function addToQueue(
    jobId: string,
    title: string,
    galleries: any[],
    isArchive = false,
    password = '',
  ) {
    const targetTemplate = '' // Default to empty, will be handled by DownloadService fallback if needed

    const mappedGalleries: DownloadGallery[] = galleries.map((g) => {
      const idMatch = g.link.match(/\/g\/(\d+)\//)
      const id = idMatch ? idMatch[1] : 'unknown'
      const targetPath = parsePath(targetTemplate, g)

      return {
        id,
        title: g.title,
        link: g.link,
        targetPath,
        isArchive: isArchive, // Use the passed parameter
        imageCount: g.imageCount || 0,
        status: 'Pending...',
        progress: 0,
        mode: 'pending',
        password: password,
      }
    })

    const existingJob = downloadingJobs.value.find((j) => j.id === jobId)
    if (existingJob) {
      existingJob.galleries = [...existingJob.galleries, ...mappedGalleries]
      existingJob.status = `Added ${galleries.length} more galleries.`
      return
    }

    const newJob: DownloadJob = {
      id: jobId,
      title: title,
      progress: 0,
      status: 'Waiting in queue...',
      mode: 'pending',
      galleries: mappedGalleries,
      isExpanded: true,
      isArchive: isArchive,
      password: password,
    }
    downloadingJobs.value.unshift(newJob)
  }

  async function startJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.id === jobId)
    if (job && (job.mode === 'pending' || job.mode === 'paused')) {
      await processDownload(job)
    }
  }

  function pauseJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.id === jobId)
    if (job) {
      job.mode = 'paused'
      job.status = 'Paused'
      job.galleries.forEach((g) => {
        if (g.mode === 'running' || g.mode === 'pending') g.mode = 'paused'
      })
    }
  }

  function stopJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.id === jobId)
    if (job) {
      job.mode = 'paused'
      job.status = 'Stopped'
      job.galleries.forEach((g) => (g.mode = 'paused'))
    }
  }

  function restartJob(jobId: string) {
    const job = downloadingJobs.value.find((j) => j.id === jobId)
    if (job) {
      job.progress = 0
      job.mode = 'pending'
      job.status = 'Restarting...'
      job.galleries.forEach((g) => {
        g.progress = 0
        g.mode = 'pending'
        g.status = 'Pending...'
      })
      startJob(jobId)
    }
  }

  async function startAllJobs() {
    const pendingJobs = downloadingJobs.value.filter(
      (j) => j.mode === 'pending' || j.mode === 'paused',
    )
    for (const job of pendingJobs) {
      // Non-blocking start for each job
      processDownload(job)
    }
  }

  async function processDownload(job: DownloadJob) {
    if (job.mode === 'running') return

    job.mode = 'running'
    const galleries = job.galleries
    let completedGalleriesCount = 0
    const totalGalleriesCount = galleries.length

    for (const gallery of galleries) {
      if ((job.mode as string) === 'paused' || (job.mode as string) === 'pending') break

      if (gallery.mode === 'completed') {
        completedGalleriesCount++
        continue
      }

      gallery.mode = 'running'
      gallery.status = 'Downloading...'

      try {
        // Centralized download logic in Main Process via DownloadService
        const result = await window.api.downloadGallery({
          url: gallery.link,
          targetTemplate: gallery.targetPath,
          isArchive: job.isArchive,
          password: job.password
        })

        if (result.success) {
          gallery.mode = 'completed'
          gallery.progress = 100
          gallery.status = 'Completed'
          completedGalleriesCount++
        } else {
          gallery.mode = 'error'
          gallery.status = result.error || 'Failed'
          logStore.addLog({
            level: 'error',
            message: `Download Error [${gallery.title}]: ${result.error}`,
          })
        }

        job.progress = Math.round((completedGalleriesCount / totalGalleriesCount) * 100)
        job.status = `Progress: ${completedGalleriesCount}/${totalGalleriesCount} galleries.`
      } catch (error: any) {
        gallery.mode = 'error'
        gallery.status = error.message
        logStore.addLog({
          level: 'error',
          message: `IPC Error [${gallery.title}]: ${error.message}`,
        })
      }
    }

    if (completedGalleriesCount === totalGalleriesCount) {
      job.mode = 'completed'
      job.status = job.isArchive ? 'Finished & Archived' : 'Finished'
      completedTasks.value.unshift({
        ...job,
        date: new Date().toLocaleString(),
      })
    } else if ((job.mode as string) !== 'paused' && (job.mode as string) !== 'pending') {
      job.mode = 'error'
      job.status = `Error: ${completedGalleriesCount}/${totalGalleriesCount} galleries completed`
    }
  }

  // Listen for real-time status updates from DownloadService
  window.api.onDownloadStatusUpdate((data: any) => {
    // Find matching gallery across all active jobs
    for (const job of downloadingJobs.value) {
      const gallery = job.galleries.find(g => g.link === data.url)
      if (gallery && gallery.mode === 'running') {
        if (data.progress !== undefined) {
          gallery.progress = data.progress
        }
        if (data.status) {
          gallery.status = data.status
        }
        // If one gallery has specific progress, we can update job summary too
        break
      }
    }
  })

  function clearFinishedJobs() {
    downloadingJobs.value = downloadingJobs.value.filter(
      (j) => j.mode !== 'completed' && j.mode !== 'error',
    )
  }

  // Listen for archive progress from main process
  window.api.onArchiveProgress((data: any) => {
    const job = downloadingJobs.value.find((j) => {
      // Find job by checking if its derived path matches (simplified)
      // or we could add a job linking mechanism.
      // For now, let's assume we update the job that is currently "Archiving"
      return j.isArchiving && j.mode === 'running'
    })
    if (job) {
      job.archiveProgress = data.progress
    }
  })

  return {
    downloadingJobs,
    completedTasks,
    libraryGalleries,
    addToQueue,
    startJob,
    startAllJobs,
    pauseJob,
    stopJob,
    restartJob,
    clearFinishedJobs,
  }
})
