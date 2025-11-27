import { formatTtlToReadable } from './format-duration.js'

describe('formatTtlToReadable', () => {
  it('returns "1 hour" for exactly 1 hour', () => {
    const oneHourMs = 1000 * 60 * 60
    expect(formatTtlToReadable(oneHourMs)).toBe('1 hour')
  })

  it('returns plural hours for multiple hours', () => {
    const fourHoursMs = 4 * 1000 * 60 * 60
    expect(formatTtlToReadable(fourHoursMs)).toBe('4 hours')
  })

  it('returns "1 day" for exactly 1 day', () => {
    const oneDayMs = 24 * 1000 * 60 * 60
    expect(formatTtlToReadable(oneDayMs)).toBe('1 day')
  })

  it('returns plural days for multiple days', () => {
    const sevenDaysMs = 7 * 24 * 1000 * 60 * 60
    expect(formatTtlToReadable(sevenDaysMs)).toBe('7 days')
  })

  it('rounds to nearest hour for fractional hours', () => {
    const twoAndHalfHoursMs = 2.5 * 1000 * 60 * 60
    expect(formatTtlToReadable(twoAndHalfHoursMs)).toBe('3 hours')
  })

  it('rounds to nearest day for fractional days', () => {
    const twentyEightDaysMs = 28 * 24 * 1000 * 60 * 60
    expect(formatTtlToReadable(twentyEightDaysMs)).toBe('28 days')
  })
})
