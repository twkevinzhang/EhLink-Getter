import cron, { type ScheduledTask } from 'node-cron'
import type { Schedule, ScheduleRunTrigger } from '@shared/types/api'

type ScheduleExecutor = (scheduleId: string, trigger: ScheduleRunTrigger) => Promise<void>

/**
 * Owns wall-clock scheduling only. Schedule execution and persistence belong to
 * ScheduleRunnerService/WorkspaceRepository respectively.
 */
export class SchedulerService {
  private scheduleTasks = new Map<string, ScheduledTask>()
  private runningScheduleIds = new Set<string>()

  static validateCron(expression: string): boolean {
    const normalized = expression.trim()
    return normalized.split(/\s+/).length === 5 && cron.validate(normalized)
  }

  startSchedules(
    getSchedules: () => Schedule[],
    executeSchedule: ScheduleExecutor,
    catchUp = false,
  ): void {
    this.stopTasks()

    for (const schedule of getSchedules()) {
      if (!schedule.enabled || !SchedulerService.validateCron(schedule.cronExpression))
        continue
      const task = cron.schedule(schedule.cronExpression, () => {
        void this.execute(schedule.scheduleId, 'cron', executeSchedule)
      })
      this.scheduleTasks.set(schedule.scheduleId, task)

      if (
        catchUp &&
        schedule.lastRunAt &&
        this.wasCronDueSince(
          schedule.cronExpression,
          new Date(schedule.lastRunAt),
          new Date(),
        )
      ) {
        void this.execute(schedule.scheduleId, 'catch-up', executeSchedule)
      }
    }
  }

  /** Immediately runs a schedule while sharing the same non-reentry guard as Cron. */
  runNow(scheduleId: string, executeSchedule: ScheduleExecutor): Promise<boolean> {
    return this.execute(scheduleId, 'manual', executeSchedule)
  }

  isRunning(scheduleId: string): boolean {
    return this.runningScheduleIds.has(scheduleId)
  }

  stop(): void {
    this.stopTasks()
    this.runningScheduleIds.clear()
  }

  private stopTasks(): void {
    for (const task of this.scheduleTasks.values()) task.stop()
    this.scheduleTasks.clear()
  }

  private async execute(
    scheduleId: string,
    trigger: ScheduleRunTrigger,
    executeSchedule: ScheduleExecutor,
  ): Promise<boolean> {
    if (this.runningScheduleIds.has(scheduleId)) return false
    this.runningScheduleIds.add(scheduleId)
    try {
      await executeSchedule(scheduleId, trigger)
      return true
    } finally {
      this.runningScheduleIds.delete(scheduleId)
    }
  }

  private wasCronDueSince(expression: string, since: Date, now: Date): boolean {
    if (Number.isNaN(since.getTime()) || since >= now) return false
    const cursor = new Date(since)
    cursor.setSeconds(0, 0)
    cursor.setMinutes(cursor.getMinutes() + 1)
    const maxMinutes = 366 * 24 * 60
    for (let checked = 0; checked < maxMinutes && cursor <= now; checked++) {
      if (this.matchesCron(expression, cursor)) return true
      cursor.setMinutes(cursor.getMinutes() + 1)
    }
    return false
  }

  private matchesCron(expression: string, date: Date): boolean {
    const fields = expression.trim().split(/\s+/)
    if (fields.length !== 5) return false
    const values = [
      date.getMinutes(),
      date.getHours(),
      date.getDate(),
      date.getMonth() + 1,
      date.getDay(),
    ]
    const ranges: Array<[number, number]> = [
      [0, 59],
      [0, 23],
      [1, 31],
      [1, 12],
      [0, 7],
    ]
    return fields.every((field, index) =>
      this.matchesCronField(field, values[index], ...ranges[index]),
    )
  }

  private matchesCronField(
    field: string,
    value: number,
    min: number,
    max: number,
  ): boolean {
    return field.split(',').some((part) => {
      const [base, stepText] = part.split('/')
      const step = stepText ? Number(stepText) : 1
      if (!Number.isInteger(step) || step <= 0) return false
      let start = min
      let end = max
      if (base !== '*') {
        const range = base.split('-').map(Number)
        start = range[0]
        end = range.length > 1 ? range[1] : range[0]
      }
      if (!Number.isInteger(start) || !Number.isInteger(end)) return false
      const normalizedValue = max === 7 && value === 0 && start === 7 ? 7 : value
      return (
        normalizedValue >= start &&
        normalizedValue <= end &&
        (normalizedValue - start) % step === 0
      )
    })
  }
}
