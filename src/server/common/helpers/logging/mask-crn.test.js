import { describe, expect, test } from 'vitest'
import { maskCrn } from '~/src/server/common/helpers/logging/mask-crn.js'

describe('maskCrn', () => {
  test('reveals only the last 4 digits of a CRN', () => {
    expect(maskCrn('1100943757')).toBe('******3757')
  })

  test('masks a number CRN', () => {
    expect(maskCrn(1100943838)).toBe('******3838')
  })

  test('masks the shortest maskable CRN, leaving one star', () => {
    expect(maskCrn('51262')).toBe('*1262')
  })

  test.each(['unknown', 'system', 'N/A'])('returns sentinel value %s unchanged', (sentinel) => {
    expect(maskCrn(sentinel)).toBe(sentinel)
  })

  test.each([null, undefined])('returns "unknown" for %s', (value) => {
    expect(maskCrn(value)).toBe('unknown')
  })

  test.each(['1', '12', '1234'])('does not mask numeric values of 4 digits or fewer: %s', (value) => {
    expect(maskCrn(value)).toBe(value)
  })

  test('returns non-numeric strings unchanged', () => {
    expect(maskCrn('abc123')).toBe('abc123')
  })
})
