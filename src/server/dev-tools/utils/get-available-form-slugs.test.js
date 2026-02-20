import { vi } from 'vitest'
import { getAvailableFormSlugs } from './get-available-form-slugs.js'
import { MOCK_FORM_CACHE_SUBSET } from '~/src/__test-fixtures__/mock-forms-cache.js'

vi.mock('../../common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => MOCK_FORM_CACHE_SUBSET)
}))

describe('getAvailableFormSlugs', () => {
  let getFormsCacheMock

  beforeEach(async () => {
    vi.clearAllMocks()
    const formService = await import('../../common/forms/services/form.js')
    getFormsCacheMock = formService.getFormsCache
  })

  test('should return array of form slugs', () => {
    const result = getAvailableFormSlugs()

    expect(getFormsCacheMock).toHaveBeenCalledOnce()
    expect(result).toEqual(['example-grant', 'flying-pigs'])
  })

  test('should return empty array when cache is empty', () => {
    getFormsCacheMock.mockReturnValueOnce([])

    const result = getAvailableFormSlugs()

    expect(result).toEqual([])
  })
})
