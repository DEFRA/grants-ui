import { describe, it, expect } from 'vitest'
import { textFormatter } from './text.formatter.js'
import { fullNameFormatter } from './full-name.formatter.js'
import { addressFormatter } from './address.formatter.js'
import { contactDetailsFormatter } from './contact-details.formatter.js'
import { getFormatter } from './index.js'

describe('textFormatter', () => {
  it.each([
    ['hello', { text: 'hello' }],
    [123, { text: '123' }],
    [0, { text: '0' }]
  ])('should return text object for %s', (input, expected) => {
    expect(textFormatter(input)).toEqual(expected)
  })

  it.each([null, undefined, ''])('should return null for %s', (input) => {
    expect(textFormatter(input)).toBeNull()
  })
})

describe('fullNameFormatter', () => {
  it.each([
    [{ first: 'John', middle: 'William', last: 'Smith' }, { text: 'John William Smith' }],
    [{ first: 'John', last: 'Smith' }, { text: 'John Smith' }],
    [{ first: 'John' }, { text: 'John' }]
  ])('should format name parts correctly for %j', (input, expected) => {
    expect(fullNameFormatter(input)).toEqual(expected)
  })

  it.each([null, {}, 'John Smith'])('should return null for %s', (input) => {
    expect(fullNameFormatter(input)).toBeNull()
  })
})

describe('addressFormatter', () => {
  it.each([
    [
      { line1: '123 Main Street', line2: 'Suite 456', city: 'London', postalCode: 'SW1A 1AA' },
      { html: '123 Main Street<br/>Suite 456<br/>London<br/>SW1A 1AA' }
    ],
    [{ line1: '123 Main Street', postalCode: 'SW1A 1AA' }, { html: '123 Main Street<br/>SW1A 1AA' }],
    [{ line1: '  123 Main Street  ', city: '  London  ' }, { html: '123 Main Street<br/>London' }]
  ])('should format address correctly for %j', (input, expected) => {
    expect(addressFormatter(input)).toEqual(expected)
  })

  it.each([null, {}, '123 Main Street'])('should return null for %s', (input) => {
    expect(addressFormatter(input)).toBeNull()
  })
})

describe('contactDetailsFormatter', () => {
  it('should format phone and email with line break', () => {
    const values = ['01234567890', 'test@example.com']
    const result = contactDetailsFormatter(values)
    expect(result).toHaveProperty('html')
    expect(result.html).toContain('test@example.com')
  })

  it('should handle only phone', () => {
    const values = ['01234567890', null]
    const result = contactDetailsFormatter(values)
    expect(result).toHaveProperty('html')
  })

  it('should handle only email', () => {
    const values = [null, 'test@example.com']
    expect(contactDetailsFormatter(values)).toEqual({
      html: 'test@example.com'
    })
  })

  it.each(['test@example.com', [null, null], []])('should return null for %s', (input) => {
    expect(contactDetailsFormatter(input)).toBeNull()
  })
})

describe('getFormatter', () => {
  it.each([
    ['text', textFormatter],
    ['fullName', fullNameFormatter],
    ['address', addressFormatter],
    ['contactDetails', contactDetailsFormatter]
  ])('should return correct formatter for "%s"', (name, expected) => {
    expect(getFormatter(name)).toBe(expected)
  })

  it.each(['unknown', undefined])('should return textFormatter for %s', (input) => {
    expect(getFormatter(input)).toBe(textFormatter)
  })
})
