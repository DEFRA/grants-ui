import { vi } from 'vitest'
import { getAvailableFormSlugs } from './get-available-form-slugs.js'

vi.mock('../../common/forms/services/forms-redis.js', () => ({
  getFormsRedisClient: vi.fn(() => ({})),
  getAllSlugs: vi.fn()
}))

describe('getAvailableFormSlugs', () => {
  let getAllSlugsMock

  beforeEach(async () => {
    vi.clearAllMocks()
    const formsRedis = await import('../../common/forms/services/forms-redis.js')
    getAllSlugsMock = formsRedis.getAllSlugs
  })

  test('should return array of form slugs', async () => {
    getAllSlugsMock.mockResolvedValue(['example-grant', 'pigs-might-fly'])

    const result = await getAvailableFormSlugs()

    expect(getAllSlugsMock).toHaveBeenCalledOnce()
    expect(result).toEqual(['example-grant', 'pigs-might-fly'])
  })

  test('should return empty array when cache is empty', async () => {
    getAllSlugsMock.mockResolvedValue([])

    const result = await getAvailableFormSlugs()

    expect(result).toEqual([])
  })
})
