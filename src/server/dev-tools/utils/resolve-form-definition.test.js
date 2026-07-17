import { notFound } from '@hapi/boom'
import { resolveFormDefinition } from './resolve-form-definition.js'

const buildRequest = (getFormDefinitionBySlug) => ({
  params: { slug: 'test-form' },
  server: { methods: { getFormService: () => ({ getFormDefinitionBySlug }) } }
})

describe('resolveFormDefinition', () => {
  test('resolves the definition for the requested slug via the forms service', async () => {
    const definition = { name: 'Test Form', pages: [] }
    const getFormDefinitionBySlug = vi.fn().mockResolvedValue(definition)

    const result = await resolveFormDefinition(buildRequest(getFormDefinitionBySlug))

    expect(getFormDefinitionBySlug).toHaveBeenCalledWith('test-form')
    expect(result).toBe(definition)
  })

  test('returns null when the backend has no definition for the slug', async () => {
    const getFormDefinitionBySlug = vi.fn().mockRejectedValue(notFound("Form definition for 'test-form' not found"))

    const result = await resolveFormDefinition(buildRequest(getFormDefinitionBySlug))

    expect(result).toBeNull()
  })

  test('rethrows non-404 errors', async () => {
    const getFormDefinitionBySlug = vi.fn().mockRejectedValue(new Error('backend unavailable'))

    await expect(resolveFormDefinition(buildRequest(getFormDefinitionBySlug))).rejects.toThrow('backend unavailable')
  })
})
