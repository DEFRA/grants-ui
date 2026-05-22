import { clearYamlCache, findFormBySlug, loadFormDefinition } from './find-form-by-slug.js'
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
    clearYamlCache()
    mockFormsService = { getFormDefinitionBySlug: vi.fn() }
  })

  test('reads and parses YAML file for yaml-sourced forms', async () => {
    const rawYaml = 'name: Test Form\npages: []'
    const parsedDef = { name: 'Test Form', pages: [] }
    mockReadFile.mockResolvedValue(rawYaml)
    mockParseYaml.mockReturnValue(parsedDef)

    const result = await loadFormDefinition(
      { source: 'yaml', path: '/path/to/form.yaml', slug: 'test-form' },
      mockFormsService
    )

    expect(mockReadFile).toHaveBeenCalledWith('/path/to/form.yaml', 'utf8')
    expect(mockParseYaml).toHaveBeenCalledWith(rawYaml)
    expect(result).toEqual(parsedDef)
  })

  test('returns a cached YAML definition on subsequent calls without re-reading the file', async () => {
    const rawYaml = 'name: Test Form\npages: []'
    const parsedDef = { name: 'Test Form', pages: [] }
    mockReadFile.mockResolvedValue(rawYaml)
    mockParseYaml.mockReturnValue(parsedDef)

    const form = { source: 'yaml', path: '/path/to/form.yaml', slug: 'test-form' }
    await loadFormDefinition(form, mockFormsService)
    const result = await loadFormDefinition(form, mockFormsService)

    expect(mockReadFile).toHaveBeenCalledTimes(1)
    expect(mockParseYaml).toHaveBeenCalledTimes(1)
    expect(result).toEqual(parsedDef)
  })

  test('returns a deep clone so callers cannot mutate the cache', async () => {
    const rawYaml = 'name: Test Form\npages: []'
    const parsedDef = { name: 'Test Form', pages: [] }
    mockReadFile.mockResolvedValue(rawYaml)
    mockParseYaml.mockReturnValue(parsedDef)

    const form = { source: 'yaml', path: '/path/to/form.yaml', slug: 'test-form' }
    const first = await loadFormDefinition(form, mockFormsService)
    first.name = 'Mutated'
    const second = await loadFormDefinition(form, mockFormsService)

    expect(second.name).toBe('Test Form')
  })

  test('delegates to formsService.getFormDefinitionBySlug for api-sourced forms', async () => {
    const def = { name: 'API Form', pages: [] }
    mockFormsService.getFormDefinitionBySlug.mockResolvedValue(def)

    const result = await loadFormDefinition({ source: 'api', slug: 'api-form' }, mockFormsService)

    expect(mockFormsService.getFormDefinitionBySlug).toHaveBeenCalledWith('api-form')
    expect(result).toEqual(def)
  })

  test('propagates errors from formsService.getFormDefinitionBySlug for api-sourced forms', async () => {
    mockFormsService.getFormDefinitionBySlug.mockRejectedValue(new Error('API fetch failed'))

    await expect(loadFormDefinition({ source: 'api', slug: 'api-form' }, mockFormsService)).rejects.toThrow(
      'API fetch failed'
    )
  })
})
