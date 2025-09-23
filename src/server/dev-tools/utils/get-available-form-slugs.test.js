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

describe('get-available-form-slugs', () => {
  let getFormsCacheMock

  beforeEach(async () => {
    vi.clearAllMocks()
    const formService = await import('../../common/forms/services/form.js')
    getFormsCacheMock = formService.getFormsCache
  })

  describe('getAvailableFormSlugs', () => {
    test('should return array of form slugs', () => {
      const result = getAvailableFormSlugs()

      expect(getFormsCacheMock).toHaveBeenCalled()
      expect(result).toEqual(['example-grant', 'adding-value', 'flying-pigs'])
    })

    test('should return empty array when cache is empty', () => {
      getFormsCacheMock.mockReturnValueOnce([])

      const result = getAvailableFormSlugs()

      expect(result).toEqual([])
      expect(Array.isArray(result)).toBe(true)
    })

    test('should extract only slug values', () => {
      const formsWithExtraProperties = [
        { id: 'form1', slug: 'slug1', title: 'Title 1', metadata: {}, enabled: true },
        { id: 'form2', slug: 'slug2', title: 'Title 2', version: '1.0' },
        { id: 'form3', slug: 'slug3', title: 'Title 3', config: { test: true } }
      ]

      getFormsCacheMock.mockReturnValueOnce(formsWithExtraProperties)

      const result = getAvailableFormSlugs()

      expect(result).toEqual(['slug1', 'slug2', 'slug3'])
      expect(result.every(item => typeof item === 'string')).toBe(true)
    })

    test('should handle forms with null slugs', () => {
      const formsWithNullSlugs = [
        { id: 'form1', slug: 'valid-slug', title: 'Valid Form' },
        { id: 'form2', slug: null, title: 'Form with null slug' },
        { id: 'form3', slug: 'another-valid-slug', title: 'Another Valid Form' }
      ]

      getFormsCacheMock.mockReturnValueOnce(formsWithNullSlugs)

      const result = getAvailableFormSlugs()

      expect(result).toEqual(['valid-slug', null, 'another-valid-slug'])
    })

    test('should handle forms with undefined slugs', () => {
      const formsWithUndefinedSlugs = [
        { id: 'form1', slug: 'defined-slug', title: 'Form with defined slug' },
        { id: 'form2', title: 'Form without slug property' },
        { id: 'form3', slug: undefined, title: 'Form with undefined slug' }
      ]

      getFormsCacheMock.mockReturnValueOnce(formsWithUndefinedSlugs)

      const result = getAvailableFormSlugs()

      expect(result).toEqual(['defined-slug', undefined, undefined])
    })

    test('should call getFormsCache exactly once', () => {
      getAvailableFormSlugs()

      expect(getFormsCacheMock).toHaveBeenCalledTimes(1)
      expect(getFormsCacheMock).toHaveBeenCalledWith()
    })

    const cacheVariations = [
      {
        name: 'single form',
        cache: [{ id: 'single', slug: 'single-form', title: 'Single Form' }],
        expected: ['single-form']
      },
      {
        name: 'forms with special character slugs',
        cache: [
          { id: 'form1', slug: 'form-with-dashes', title: 'Form 1' },
          { id: 'form2', slug: 'form_with_underscores', title: 'Form 2' },
          { id: 'form3', slug: 'form123numbers', title: 'Form 3' }
        ],
        expected: ['form-with-dashes', 'form_with_underscores', 'form123numbers']
      },
      {
        name: 'forms with empty string slugs',
        cache: [
          { id: 'form1', slug: '', title: 'Form with empty slug' },
          { id: 'form2', slug: 'valid-slug', title: 'Form with valid slug' },
          { id: 'form3', slug: '', title: 'Another form with empty slug' }
        ],
        expected: ['', 'valid-slug', '']
      },
      {
        name: 'forms with numeric slugs',
        cache: [
          { id: 'form1', slug: '123', title: 'Numeric slug form' },
          { id: 'form2', slug: '456-form', title: 'Mixed numeric slug' }
        ],
        expected: ['123', '456-form']
      },
      {
        name: 'large number of forms',
        cache: Array.from({ length: 100 }, (_, i) => ({
          id: `form${i}`,
          slug: `form-${i}`,
          title: `Form ${i}`
        })),
        expected: Array.from({ length: 100 }, (_, i) => `form-${i}`)
      }
    ]

    test.each(cacheVariations)(
      'should handle $name correctly',
      ({ cache, expected }) => {
        getFormsCacheMock.mockReturnValueOnce(cache)

        const result = getAvailableFormSlugs()

        expect(result).toEqual(expected)
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBe(cache.length)
      }
    )

    test('should handle cache function throwing error', () => {
      getFormsCacheMock.mockImplementationOnce(() => {
        throw new Error('Cache error')
      })

      expect(() => getAvailableFormSlugs()).toThrow('Cache error')
    })

    test('should handle cache returning null', () => {
      getFormsCacheMock.mockReturnValueOnce(null)

      expect(() => getAvailableFormSlugs()).toThrow()
    })

    test('should handle cache returning non-array', () => {
      getFormsCacheMock.mockReturnValueOnce('not-an-array')

      expect(() => getAvailableFormSlugs()).toThrow()
    })

    test('should handle forms without slug property consistently', () => {
      const formsWithoutSlugProperty = [
        { id: 'form1', title: 'Form 1' },
        { id: 'form2', title: 'Form 2' },
        { id: 'form3', title: 'Form 3' }
      ]

      getFormsCacheMock.mockReturnValueOnce(formsWithoutSlugProperty)

      const result = getAvailableFormSlugs()

      expect(result).toEqual([undefined, undefined, undefined])
      expect(result.length).toBe(3)
    })

    test('should preserve order of forms from cache', () => {
      const orderedForms = [
        { id: 'z-form', slug: 'z-slug', title: 'Z Form' },
        { id: 'a-form', slug: 'a-slug', title: 'A Form' },
        { id: 'm-form', slug: 'm-slug', title: 'M Form' }
      ]

      getFormsCacheMock.mockReturnValueOnce(orderedForms)

      const result = getAvailableFormSlugs()

      expect(result).toEqual(['z-slug', 'a-slug', 'm-slug'])
    })

    test('should return different arrays for different cache contents', () => {
      const firstCache = [{ id: '1', slug: 'first' }]
      const secondCache = [{ id: '2', slug: 'second' }]

      getFormsCacheMock.mockReturnValueOnce(firstCache)
      const firstResult = getAvailableFormSlugs()

      getFormsCacheMock.mockReturnValueOnce(secondCache)
      const secondResult = getAvailableFormSlugs()

      expect(firstResult).toEqual(['first'])
      expect(secondResult).toEqual(['second'])
      expect(firstResult).not.toEqual(secondResult)
    })
  })
})