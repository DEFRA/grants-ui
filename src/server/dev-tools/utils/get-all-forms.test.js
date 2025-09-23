import { vi } from 'vitest'
import { getAllForms } from './get-all-forms.js'

const mockFormCache = [
  { id: 'form1', slug: 'example-grant', title: 'Example Grant' },
  { id: 'form2', slug: 'adding-value', title: 'Adding Value Grant' },
  { id: 'form3', slug: 'flying-pigs', title: 'Flying Pigs Grant' }
]

vi.mock('../../common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => mockFormCache)
}))

describe('get-all-forms', () => {
  let getFormsCacheMock

  beforeEach(async () => {
    vi.clearAllMocks()
    const formService = await import('../../common/forms/services/form.js')
    getFormsCacheMock = formService.getFormsCache
  })

  describe('getAllForms', () => {
    test('should return all forms from cache', () => {
      const result = getAllForms()

      expect(getFormsCacheMock).toHaveBeenCalled()
      expect(result).toEqual(mockFormCache)
    })

    test('should return same reference as cache', () => {
      const result = getAllForms()

      expect(result).toBe(mockFormCache)
    })

    test('should handle empty cache', () => {
      getFormsCacheMock.mockReturnValueOnce([])

      const result = getAllForms()

      expect(result).toEqual([])
      expect(Array.isArray(result)).toBe(true)
    })

    test('should handle cache with different form structures', () => {
      const alternativeCache = [
        { id: 'alt1', slug: 'alt-form-1', title: 'Alternative Form 1', metadata: {} },
        { id: 'alt2', slug: 'alt-form-2', title: 'Alternative Form 2', enabled: true },
        { id: 'alt3', slug: 'alt-form-3', title: 'Alternative Form 3', version: '1.0' }
      ]

      getFormsCacheMock.mockReturnValueOnce(alternativeCache)

      const result = getAllForms()

      expect(result).toEqual(alternativeCache)
    })

    test('should call getFormsCache exactly once', () => {
      getAllForms()

      expect(getFormsCacheMock).toHaveBeenCalledTimes(1)
      expect(getFormsCacheMock).toHaveBeenCalledWith()
    })

    test('should return new call results each time cache changes', () => {
      const firstCache = [{ id: '1', slug: 'first' }]
      const secondCache = [{ id: '2', slug: 'second' }]

      getFormsCacheMock.mockReturnValueOnce(firstCache)
      const firstResult = getAllForms()

      getFormsCacheMock.mockReturnValueOnce(secondCache)
      const secondResult = getAllForms()

      expect(firstResult).toEqual(firstCache)
      expect(secondResult).toEqual(secondCache)
      expect(firstResult).not.toEqual(secondResult)
      expect(getFormsCacheMock).toHaveBeenCalledTimes(2)
    })

    const cacheVariations = [
      {
        name: 'single form',
        cache: [{ id: 'single', slug: 'single-form', title: 'Single Form' }]
      },
      {
        name: 'multiple forms with different properties',
        cache: [
          { id: 'form1', slug: 'form-1', title: 'Form 1', type: 'grant' },
          { id: 'form2', slug: 'form-2', title: 'Form 2', type: 'application' },
          { id: 'form3', slug: 'form-3', title: 'Form 3', type: 'survey' }
        ]
      },
      {
        name: 'forms with complex metadata',
        cache: [
          {
            id: 'complex1',
            slug: 'complex-form',
            title: 'Complex Form',
            metadata: {
              version: '2.1',
              author: 'Developer',
              tags: ['grant', 'application']
            },
            configuration: {
              multiPage: true,
              validation: 'strict'
            }
          }
        ]
      },
      {
        name: 'forms with null and undefined values',
        cache: [
          { id: 'nullform', slug: null, title: 'Form with null slug' },
          { id: 'undefinedform', slug: 'defined-slug', title: undefined },
          { id: null, slug: 'null-id-form', title: 'Form with null id' }
        ]
      }
    ]

    test.each(cacheVariations)(
      'should handle $name correctly',
      ({ cache }) => {
        getFormsCacheMock.mockReturnValueOnce(cache)

        const result = getAllForms()

        expect(result).toEqual(cache)
        expect(Array.isArray(result)).toBe(true)
      }
    )

    test('should handle cache function throwing error', () => {
      getFormsCacheMock.mockImplementationOnce(() => {
        throw new Error('Cache error')
      })

      expect(() => getAllForms()).toThrow('Cache error')
    })

    test('should handle cache returning non-array', () => {
      getFormsCacheMock.mockReturnValueOnce(null)

      const result = getAllForms()

      expect(result).toBeNull()
    })

    test('should handle cache returning undefined', () => {
      getFormsCacheMock.mockReturnValueOnce(undefined)

      const result = getAllForms()

      expect(result).toBeUndefined()
    })
  })
})