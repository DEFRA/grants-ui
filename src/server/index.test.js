import { describe, test, expect } from 'vitest'
import { updateVisitedSections } from '~/src/server/common/helpers/visited-sections-guard.js'

/**
 * CWE-400 Protection: Tests bounded session array to prevent memory exhaustion
 */
describe('updateVisitedSections', () => {
  test('enforces 500 entry limit using FIFO eviction', () => {
    const sections = Array.from({ length: 500 }, (_, i) => `section-${i}`)
    const result = updateVisitedSections(sections, 'section-500')

    expect(result).toHaveLength(500)
    expect(result).not.toContain('section-0')
    expect(result[0]).toBe('section-1')
    expect(result[499]).toBe('section-500')
  })

  test('allows growth under 500 entries', () => {
    const sections = Array.from({ length: 10 }, (_, i) => `section-${i}`)
    const result = updateVisitedSections(sections, 'section-10')

    expect(result).toHaveLength(11)
    expect(result).toContain('section-0')
    expect(result).toContain('section-10')
  })

  test('prevents duplicate entries', () => {
    const sections = ['section-1', 'section-2', 'section-3']
    const result = updateVisitedSections(sections, 'section-2')

    expect(result).toHaveLength(3)
    expect(result).toEqual(['section-1', 'section-2', 'section-3'])
  })

  test('handles empty and undefined arrays', () => {
    expect(updateVisitedSections(undefined, 'section-1')).toEqual(['section-1'])
    expect(updateVisitedSections([], 'section-1')).toEqual(['section-1'])
  })

  test('ignores null and falsy section IDs', () => {
    const sections = ['section-1', 'section-2']

    expect(updateVisitedSections(sections, null)).toEqual(sections)
    expect(updateVisitedSections(sections, undefined)).toEqual(sections)
    expect(updateVisitedSections(sections, '')).toEqual(sections)
  })

  test('maintains FIFO order across multiple additions', () => {
    let sections = Array.from({ length: 498 }, (_, i) => `section-${i}`)

    sections = updateVisitedSections(sections, 'section-498')
    expect(sections).toHaveLength(499)

    sections = updateVisitedSections(sections, 'section-499')
    expect(sections).toHaveLength(500)
    expect(sections).toContain('section-0')

    sections = updateVisitedSections(sections, 'section-500')
    expect(sections).toHaveLength(500)
    expect(sections[0]).toBe('section-1')

    sections = updateVisitedSections(sections, 'section-501')
    expect(sections[0]).toBe('section-2')
  })

  test('handles sustained high volume additions', () => {
    let sections = []

    for (let i = 0; i < 1000; i++) {
      sections = updateVisitedSections(sections, `section-${i}`)
    }

    expect(sections).toHaveLength(500)
    expect(sections[0]).toBe('section-500')
    expect(sections[499]).toBe('section-999')
  })
})
