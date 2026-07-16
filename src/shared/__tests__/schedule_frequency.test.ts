import { describe, expect, it } from 'vitest'
import {
  buildCronExpression,
  formatScheduleFrequency,
  parseScheduleFrequency,
} from '../schedule_frequency'

describe('schedule frequency helpers', () => {
  it('builds and parses supported interval frequencies', () => {
    const cron = buildCronExpression({
      mode: 'interval',
      intervalHours: 6,
      time: '00:00',
      weekdays: [1],
      customCron: '',
    })
    expect(cron).toBe('0 */6 * * *')
    expect(parseScheduleFrequency(cron)).toMatchObject({
      mode: 'interval',
      intervalHours: 6,
    })
    expect(formatScheduleFrequency(cron)).toBe('每 6 小時')
  })

  it('builds daily and weekly frequencies in local wall-clock time', () => {
    expect(
      buildCronExpression({
        mode: 'daily',
        intervalHours: 6,
        time: '14:30',
        weekdays: [],
        customCron: '',
      }),
    ).toBe('30 14 * * *')
    const weekly = buildCronExpression({
      mode: 'weekly',
      intervalHours: 6,
      time: '09:05',
      weekdays: [5, 1, 1],
      customCron: '',
    })
    expect(weekly).toBe('5 9 * * 1,5')
    expect(formatScheduleFrequency(weekly)).toBe('每週一、週五 09:05')
  })

  it('keeps custom five-field Cron expressions untouched', () => {
    expect(
      buildCronExpression({
        mode: 'custom',
        intervalHours: 6,
        time: '00:00',
        weekdays: [1],
        customCron: '15 3 1 * *',
      }),
    ).toBe('15 3 1 * *')
    expect(parseScheduleFrequency('15 3 1 * *').mode).toBe('custom')
  })

  it('rejects an empty custom expression and weekly frequency without a day', () => {
    expect(() =>
      buildCronExpression({
        mode: 'custom',
        intervalHours: 6,
        time: '00:00',
        weekdays: [1],
        customCron: ' ',
      }),
    ).toThrow('請輸入自訂 Cron string')
    expect(() =>
      buildCronExpression({
        mode: 'weekly',
        intervalHours: 6,
        time: '00:00',
        weekdays: [],
        customCron: '',
      }),
    ).toThrow('每週排程至少要選擇一天')
  })
})
