import { vi } from 'vitest'
import { getAllForms } from './get-all-forms.js'
import { MOCK_FORM_CACHE } from '../../confirmation/__test-fixtures__/confirmation-test-fixtures.js'

vi.mock('../../common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => MOCK_FORM_CACHE)
}))

describe('get-all-forms', () => {
  let getFormsCacheMock

  beforeEach(async () => {
    vi.clearAllMocks()
    const formService = await import('../../common/forms/services/form.js')
    getFormsCacheMock = formService.getFormsCache
  })

  test('should return all forms from cache', () => {
    const result = getAllForms()

    expect(getFormsCacheMock).toHaveBeenCalled()
    expect(result).toEqual(MOCK_FORM_CACHE)
  })

  test('should handle empty cache', () => {
    getFormsCacheMock.mockReturnValueOnce([])

    const result = getAllForms()

    expect(result).toEqual([])
    expect(Array.isArray(result)).toBe(true)
  })
})
