import { findFormBySlug } from './find-form-by-slug.js'
import { MOCK_FORM_CACHE, MOCK_FORM_ENTRIES } from '~/src/__test-fixtures__/mock-forms-cache.js'

vi.mock('~/src/server/common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => MOCK_FORM_CACHE)
}))

describe('findFormBySlug', () => {
  test('should return the form matching the given slug', () => {
    const result = findFormBySlug('another-form')

    expect(result).toEqual(MOCK_FORM_ENTRIES.anotherForm)
  })

  test('should return null when no form matches the slug', () => {
    expect(findFormBySlug('non-existent')).toBeNull()
  })

  test('should return the first match when searching', () => {
    const result = findFormBySlug('test-form')
    expect(result.id).toBe(MOCK_FORM_ENTRIES.testForm.id)
  })
})
