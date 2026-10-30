import { formatNumberAnswer } from './number-field-format.js'

describe('formatNumberAnswer', () => {
  test.each([
    [{ type: 'NumberField', format: 'thousands' }, 125000.5, '125000.50', '125,000.50'],
    [{ type: 'NumberField', format: 'thousands' }, 0, undefined, '0'],
    [{ type: 'NumberField', format: 'thousands' }, -125000.5, undefined, '-125,000.5'],
    [{ type: 'NumberField', format: 'thousands' }, 125000.5, '125000.25', '125,000.5'],
    [{ type: 'NumberField' }, 125000.5, '125000.50', '125000.5'],
    [{ type: 'TextField', format: 'thousands' }, '125000.50', undefined, '125000.50']
  ])('formats configured answers', (component, value, rawInput, expected) => {
    expect(formatNumberAnswer(component, value, rawInput)).toBe(expected)
  })

  test.each([null, undefined])('returns an empty string for %s', (value) => {
    expect(formatNumberAnswer({ type: 'NumberField', format: 'thousands' }, value)).toBe('')
  })
})
