import { findFormBySlug, loadFormDefinition } from './find-form-by-slug.js'
import { MOCK_FORM_ENTRIES } from '~/src/__test-fixtures__/mock-forms-cache.js'

const { mockReadFile, mockParseYaml } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockParseYaml: vi.fn()
}))

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockReadFile },
  readFile: mockReadFile
}))

vi.mock('yaml', () => ({
  parse: mockParseYaml
}))

vi.mock('./forms-redis.js', () => ({
  getFormsRedisClient: vi.fn(() => ({})),
  getFormMeta: vi.fn(),
  getFormDef: vi.fn()
}))

describe('findFormBySlug', () => {
  // eslint-disable-next-line no-unused-vars
  let getFormMetaMock, getFormDefMock

  beforeEach(async () => {
    vi.clearAllMocks()
    const formsRedis = await import('./forms-redis.js')
    getFormMetaMock = formsRedis.getFormMeta
    getFormDefMock = formsRedis.getFormDef
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

describe('loadFormDefinition', () => {
  let getFormDefMock

  beforeEach(async () => {
    vi.clearAllMocks()
    const formsRedis = await import('./forms-redis.js')
    getFormDefMock = formsRedis.getFormDef
  })

  test('reads and parses YAML file for yaml-sourced forms', async () => {
    const rawYaml = 'name: Test Form\npages: []'
    const parsedDef = { name: 'Test Form', pages: [] }
    mockReadFile.mockResolvedValue(rawYaml)
    mockParseYaml.mockReturnValue(parsedDef)

    const result = await loadFormDefinition({ source: 'yaml', path: '/path/to/form.yaml', slug: 'test-form' })

    expect(mockReadFile).toHaveBeenCalledWith('/path/to/form.yaml', 'utf8')
    expect(mockParseYaml).toHaveBeenCalledWith(rawYaml)
    expect(result).toEqual(parsedDef)
  })

  test('returns cached definition from Redis for api-sourced forms', async () => {
    const def = { name: 'API Form', pages: [] }
    getFormDefMock.mockResolvedValue(def)

    const result = await loadFormDefinition({ source: 'api', slug: 'api-form' })

    expect(getFormDefMock).toHaveBeenCalledWith({}, 'api-form')
    expect(result).toEqual(def)
  })

  test('throws when api-sourced form definition is not in Redis', async () => {
    getFormDefMock.mockResolvedValue(null)

    await expect(loadFormDefinition({ source: 'api', slug: 'api-form' })).rejects.toThrow(
      'Form definition not found in Redis for slug: api-form'
    )
  })
})
