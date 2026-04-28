import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/index.js'
import { validateRequestAndFindForm } from './form-verify-and-request-load.js'
import { vi } from 'vitest'
import { findFormBySlug } from '../forms/services/find-form-by-slug.js'
import { MOCK_FORM_WITH_PATH } from '~/src/__test-fixtures__/mock-forms-cache.js'

vi.mock('../forms/services/find-form-by-slug.js')

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
    expect(requestProps.app.model.def.metadata).to.eql({ some: 'metadata' })
  })
})
