import { vi } from 'vitest'
import { getAllForms } from './get-all-forms.js'
import { MOCK_FORM_CACHE } from '../../confirmation/__test-fixtures__/confirmation-test-fixtures.js'

vi.mock('../../common/forms/services/forms-redis.js', () => ({
  getFormsRedisClient: vi.fn(() => ({})),
  getAllFormMetas: vi.fn()
}))

describe('get-all-forms', () => {
  let getAllFormMetasMock

  beforeEach(async () => {
    vi.clearAllMocks()
    const formsRedis = await import('../../common/forms/services/forms-redis.js')
    getAllFormMetasMock = formsRedis.getAllFormMetas
  })

  test('should return all forms from cache', async () => {
    getAllFormMetasMock.mockResolvedValue(MOCK_FORM_CACHE)

    const result = await getAllForms()

    expect(getAllFormMetasMock).toHaveBeenCalled()
    expect(result).toEqual(MOCK_FORM_CACHE)
  })

  test('should handle empty cache', async () => {
    getAllFormMetasMock.mockResolvedValue([])

    const result = await getAllForms()

    expect(result).toEqual([])
    expect(Array.isArray(result)).toBe(true)
  })
})
