import { vi } from 'vitest'
import { getAvailableFormSlugs } from './get-available-form-slugs.js'

const mockFormCache = [
  { id: 'form1', slug: 'example-grant', title: 'Example Grant' },
  { id: 'form2', slug: 'adding-value', title: 'Adding Value Grant' },
  { id: 'form3', slug: 'flying-pigs', title: 'Flying Pigs Grant' }
]

vi.mock('../../common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => mockFormCache)
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
    expect(result).toEqual(['example-grant', 'adding-value', 'flying-pigs'])
  })

  test('should return empty array when cache is empty', () => {
    getFormsCacheMock.mockReturnValueOnce([])

    const result = getAvailableFormSlugs()

    expect(result).toEqual([])
  })
})
