import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/index.js'
import { validateRequestAndFindForm } from './form-verify-and-request-load.js'
import { vi } from 'vitest'
import { findFormBySlug } from '../forms/services/find-form-by-slug.js'
import { getStateWithDefinition } from '~/src/server/common/helpers/state/state-with-definition-context.js'
import { MOCK_FORM_WITH_PATH } from '~/src/__test-fixtures__/mock-forms-cache.js'

vi.mock('../forms/services/find-form-by-slug.js')
vi.mock('~/src/server/common/helpers/state/state-with-definition-context.js', () => ({
  getStateWithDefinition: vi.fn()
}))

const mockForm = MOCK_FORM_WITH_PATH

describe('form-verify-and-request-load', () => {
  it('should return 400 response error when slug is missing', async () => {
    const mockH = mockHapiResponseToolkit()
    const result = await validateRequestAndFindForm(mockHapiRequest({ params: {} }), mockH)
    expect(result.error).toBe(mockH)
    expect(mockH.response).toHaveBeenCalledWith('Bad request - missing slug')
    expect(mockH.code).toHaveBeenCalledWith(400)
  })

  it('should return 404 response error when form not found', async () => {
    findFormBySlug.mockResolvedValue(undefined)
    const mockH = mockHapiResponseToolkit()
    const result = await validateRequestAndFindForm(mockHapiRequest({ params: { slug: 'test-slug' } }), mockH)
    expect(result.error).toBe(mockH)
    expect(mockH.response).toHaveBeenCalledWith('Form not found')
    expect(mockH.code).toHaveBeenCalledWith(404)
  })

  it('should return form and slug and set request app model when inputs valid', async () => {
    const formWithMetaData = { ...mockForm, metadata: { some: 'metadata' } }
    findFormBySlug.mockResolvedValue(formWithMetaData)
    const mockH = mockHapiResponseToolkit()
    const requestProps = { params: { slug: 'test-slug' }, app: {} }
    const result = await validateRequestAndFindForm(mockHapiRequest(requestProps), mockH)
    expect(result.error).toBeUndefined()
    expect(result.form).toBe(formWithMetaData)
    expect(result.slug).toBe('test-slug')
    expect(requestProps.app.model.def.metadata).toEqual({ some: 'metadata' })
  })

  it('should recover metadata for backend forms from the nested form definition', async () => {
    const backendForm = { id: 'backend', slug: 'test-slug', title: 'Backend', source: 'backend' }
    findFormBySlug.mockResolvedValue(backendForm)
    // Combined endpoint returns the full documents; metadata lives on definition.definition.
    getStateWithDefinition.mockResolvedValue({
      definition: { definition: { metadata: { permissions: { resource: 'sfiApplications' } } } }
    })
    const mockH = mockHapiResponseToolkit()
    const requestProps = { params: { slug: 'test-slug' }, app: {} }

    const result = await validateRequestAndFindForm(mockHapiRequest(requestProps), mockH)

    expect(result.form).toBe(backendForm)
    expect(requestProps.app.model.def.metadata).toEqual({ permissions: { resource: 'sfiApplications' } })
  })

  it('should leave metadata undefined when the backend lookup fails', async () => {
    const backendForm = { id: 'backend', slug: 'test-slug', title: 'Backend', source: 'backend' }
    findFormBySlug.mockResolvedValue(backendForm)
    getStateWithDefinition.mockRejectedValue(new Error('backend down'))
    const mockH = mockHapiResponseToolkit()
    const requestProps = { params: { slug: 'test-slug' }, app: {} }

    const result = await validateRequestAndFindForm(mockHapiRequest(requestProps), mockH)

    expect(result.error).toBeUndefined()
    expect(requestProps.app.model.def.metadata).toBeUndefined()
  })
})
