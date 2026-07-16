import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchedulerService } from '../scheduler_service'

describe('SchedulerService', () => {
  let service: SchedulerService

  beforeEach(() => {
    vi.useFakeTimers()
    service = new SchedulerService()
  })

  afterEach(() => {
    service.stop()
    vi.useRealTimers()
  })

  it('accepts standard five-field Cron and rejects unsupported shapes', () => {
    expect(SchedulerService.validateCron('0 */6 * * *')).toBe(true)
    expect(SchedulerService.validateCron('*/10 * * * * *')).toBe(false)
    expect(SchedulerService.validateCron('not a cron')).toBe(false)
  })

  it('does not re-enter a schedule while an execution is active', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const execute = vi.fn(() => pending)

    const first = service.runNow('schedule-1', execute)
    await Promise.resolve()
    await expect(service.runNow('schedule-1', execute)).resolves.toBe(false)
    expect(execute).toHaveBeenCalledTimes(1)

    finish()
    await expect(first).resolves.toBe(true)
  })

  it('detects a missed Cron occurrence using the system timezone', () => {
    const wasDue = (service as any).wasCronDueSince(
      '30 14 * * *',
      new Date('2026-01-05T14:00:00'),
      new Date('2026-01-05T15:00:00'),
    )
    expect(wasDue).toBe(true)
  })
})
