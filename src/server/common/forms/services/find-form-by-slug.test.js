import { findFormBySlug } from './find-form-by-slug.js'
import { MOCK_FORM_ENTRIES } from '~/src/__test-fixtures__/mock-forms-cache.js'

vi.mock('./forms-redis.js', () => ({
  getFormsRedisClient: vi.fn(() => ({})),
  getFormMeta: vi.fn(),
  getFormDef: vi.fn()
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

  test('should return the form entry when searching by slug', async () => {
    getFormMetaMock.mockResolvedValue(MOCK_FORM_ENTRIES.testForm)

    const result = await findFormBySlug('test-form')
    expect(result.id).toBe(MOCK_FORM_ENTRIES.testForm.id)
  })
})
