export type ScheduleFrequencyMode = 'interval' | 'daily' | 'weekly' | 'custom'

export interface ScheduleFrequencyValue {
  mode: ScheduleFrequencyMode
  intervalHours: number
  time: string
  weekdays: number[]
  customCron: string
}

export const INTERVAL_HOUR_OPTIONS = [1, 2, 3, 4, 6, 8, 12] as const

const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

function validTime(hour: number, minute: number): boolean {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function parseScheduleFrequency(cronExpression: string): ScheduleFrequencyValue {
  const cron = cronExpression.trim()
  const interval = cron.match(/^0 \*\/(\d+) \* \* \*$/)
  if (interval) {
    const intervalHours = Number(interval[1])
    if (
      INTERVAL_HOUR_OPTIONS.includes(
        intervalHours as (typeof INTERVAL_HOUR_OPTIONS)[number],
      )
    ) {
      return {
        mode: 'interval',
        intervalHours,
        time: '00:00',
        weekdays: [1],
        customCron: cron,
      }
    }
  }

  const simple = cron.match(/^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-7](?:,[0-7])*)$/)
  if (simple) {
    const minute = Number(simple[1])
    const hour = Number(simple[2])
    if (validTime(hour, minute)) {
      if (simple[3] === '*') {
        return {
          mode: 'daily',
          intervalHours: 6,
          time: formatTime(hour, minute),
          weekdays: [1],
          customCron: cron,
        }
      }
      const weekdays = [
        ...new Set(
          simple[3].split(',').map((day) => (Number(day) === 7 ? 0 : Number(day))),
        ),
      ].sort((left, right) => left - right)
      return {
        mode: 'weekly',
        intervalHours: 6,
        time: formatTime(hour, minute),
        weekdays,
        customCron: cron,
      }
    }
  }

  return {
    mode: 'custom',
    intervalHours: 6,
    time: '00:00',
    weekdays: [1],
    customCron: cron,
  }
}

export function buildCronExpression(value: ScheduleFrequencyValue): string {
  if (value.mode === 'interval') return `0 */${value.intervalHours} * * *`

  if (value.mode === 'custom') {
    const cron = value.customCron.trim()
    if (!cron) throw new Error('請輸入自訂 Cron string')
    return cron
  }

  const match = value.time.match(/^(\d{2}):(\d{2})$/)
  if (!match || !validTime(Number(match[1]), Number(match[2]))) {
    throw new Error('請選擇有效的執行時間')
  }
  const minute = Number(match[2])
  const hour = Number(match[1])
  if (value.mode === 'daily') return `${minute} ${hour} * * *`

  const weekdays = [...new Set(value.weekdays)].sort((left, right) => left - right)
  if (!weekdays.length || weekdays.some((day) => day < 0 || day > 6)) {
    throw new Error('每週排程至少要選擇一天')
  }
  return `${minute} ${hour} * * ${weekdays.join(',')}`
}

export function formatScheduleFrequency(cronExpression: string): string {
  const value = parseScheduleFrequency(cronExpression)
  if (value.mode === 'interval') return `每 ${value.intervalHours} 小時`
  if (value.mode === 'daily') return `每天 ${value.time}`
  if (value.mode === 'weekly') {
    return `每${value.weekdays.map((day) => WEEKDAY_LABELS[day]).join('、')} ${value.time}`
  }
  return '自訂排程'
}
