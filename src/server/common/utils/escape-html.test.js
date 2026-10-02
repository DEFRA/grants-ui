import { escapeHtml } from './escape-html.js'

describe('escapeHtml', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#039;']
  ])('should escape %s as %s', (char, entity) => {
    expect(escapeHtml(char)).toBe(entity)
  })

  it('should escape & first so entities are not double-escaped', () => {
    expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;')
  })

  it('should leave safe text unchanged', () => {
    expect(escapeHtml('SAM1 for parcel AB1234 5678')).toBe('SAM1 for parcel AB1234 5678')
  })
})
