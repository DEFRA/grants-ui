import { vi } from 'vitest'
import { updateDetails } from './update-details.js'
import { findFormBySlug } from '~/src/server/common/forms/services/find-form-by-slug.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { mockHapiRequest, mockHapiResponseToolkit, mockHapiServer } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('~/src/server/common/forms/services/find-form-by-slug.js')

describe('update-details plugin', () => {
  let handler
  let mockRequest
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()

    const server = mockHapiServer()
    updateDetails.plugin.register(server)
    handler = server.route.mock.calls[0][0].handler

    mockRequest = mockHapiRequest({ params: { slug: 'test-form' } })
    mockH = mockHapiResponseToolkit()
  })

  test('registers GET /{slug}/update-details', () => {
    const server = mockHapiServer()
    updateDetails.plugin.register(server)

    expect(server.route).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/{slug}/update-details'
      })
    )
  })

  test('passes incorrectDetailsContent through when the form defines it', async () => {
    const incorrectDetailsContent = {
      heading: 'Update your details',
      paragraphs: ['Check your details.'],
      showRpaSupport: false,
      supportEmail: 'ruralpayments@defra.gov.uk'
    }
    findFormBySlug.mockResolvedValue({
      title: 'Test Form',
      metadata: { incorrectDetailsContent, supportEmail: 'ruralpayments@defra.gov.uk' }
    })

    await handler(mockRequest, mockH)

    expect(mockH.view).toHaveBeenCalledWith('incorrect-details', {
      pageTitle: 'Update your details',
      serviceName: 'Test Form',
      serviceUrl: '/test-form',
      backLink: { href: '/test-form/check-details' },
      incorrectDetailsContent,
      supportEmail: 'ruralpayments@defra.gov.uk'
    })
  })

  test('falls back to null incorrectDetailsContent when the form has no metadata entry', async () => {
    findFormBySlug.mockResolvedValue({ title: 'Test Form', metadata: {} })

    await handler(mockRequest, mockH)

    expect(mockH.view).toHaveBeenCalledWith(
      'incorrect-details',
      expect.objectContaining({ incorrectDetailsContent: null })
    )
  })

  test('returns 404 when the form is not found', async () => {
    findFormBySlug.mockResolvedValue(null)

    await handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith('Form not found')
    expect(mockH.code).toHaveBeenCalledWith(statusCodes.notFound)
    expect(mockH.view).not.toHaveBeenCalled()
  })
})
