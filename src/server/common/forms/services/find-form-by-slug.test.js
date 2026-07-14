import { findFormBySlug, loadFormDefinition } from './find-form-by-slug.js'
import { MOCK_FORM_ENTRIES } from '~/src/__test-fixtures__/mock-forms-cache.js'

vi.mock('./forms-redis.js', () => ({
  getFormsRedisClient: vi.fn(() => ({})),
  getFormMeta: vi.fn()
}))

describe('findFormBySlug', () => {
  let getFormMetaMock

  beforeEach(async () => {
    vi.clearAllMocks()
    const formsRedis = await import('./forms-redis.js')
    getFormMetaMock = formsRedis.getFormMeta
  })

  test('should return the form matching the given slug', async () => {
    getFormMetaMock.mockResolvedValue(MOCK_FORM_ENTRIES.anotherForm)

    const result = await findFormBySlug('another-form')

    expect(getFormMetaMock).toHaveBeenCalledWith({}, 'another-form')
    expect(result).toEqual(MOCK_FORM_ENTRIES.anotherForm)
  })

  test('should return null when no form matches the slug', async () => {
    getFormMetaMock.mockResolvedValue(null)

    expect(await findFormBySlug('non-existent')).toBeNull()
  })
})

describe('loadFormDefinition', () => {
  let mockFormsService

  beforeEach(() => {
    vi.clearAllMocks()
    mockFormsService = { getFormDefinitionBySlug: vi.fn() }
  })

  test('delegates to formsService.getFormDefinitionBySlug for backend-sourced forms', async () => {
    const def = { name: 'Backend Form', pages: [] }
    mockFormsService.getFormDefinitionBySlug.mockResolvedValue(def)

    const result = await loadFormDefinition({ source: 'backend', slug: 'backend-form' }, mockFormsService)

    expect(mockFormsService.getFormDefinitionBySlug).toHaveBeenCalledWith('backend-form')
    expect(result).toEqual(def)
  })

  test('propagates errors from formsService.getFormDefinitionBySlug for backend-sourced forms', async () => {
    mockFormsService.getFormDefinitionBySlug.mockRejectedValue(new Error('Backend fetch failed'))

    await expect(loadFormDefinition({ source: 'backend', slug: 'backend-form' }, mockFormsService)).rejects.toThrow(
      'Backend fetch failed'
    )
  })
})
