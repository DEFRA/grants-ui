import { vi } from 'vitest'
import { mockReadFile } from '~/src/__mocks__/fs-yaml-mocks.js'
import { printSubmittedApplication } from './print-submitted-application.controller.js'
import {
  findFormBySlug,
  buildPrintViewModel
} from '../common/helpers/print-application-service/print-application-service.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { mockHapiRequest, mockHapiResponseToolkit, mockHapiServer } from '~/src/__mocks__/hapi-mocks.js'
import { MOCK_FORM_WITH_PATH, MOCK_SINGLE_PAGE_DEFINITION } from '~/src/__test-fixtures__/mock-forms-cache.js'

vi.mock('../common/helpers/print-application-service/print-application-service.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js')
vi.mock('../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

const mockForm = MOCK_FORM_WITH_PATH
const mockDefinition = MOCK_SINGLE_PAGE_DEFINITION

const mockState = {
  applicationStatus: ApplicationStatus.SUBMITTED,
  field1: 'Some answer',
  $$__referenceNumber: 'REF-123',
  submittedAt: '2025-01-15T10:00:00.000Z',
  applicant: {
    business: { name: 'Test Business' },
    customer: { name: { first: 'Test', last: 'User' } }
  }
}

describe('print-submitted-application.controller', () => {
  let handler
  let mockRequest
  let mockH
  let mockGetState

  beforeEach(() => {
    vi.clearAllMocks()

    const server = mockHapiServer()
    printSubmittedApplication.plugin.register(server)
    handler = server.route.mock.calls[0][0].handler

    mockGetState = vi.fn().mockResolvedValue(mockState)
    getFormsCacheService.mockReturnValue({ getState: mockGetState })

    mockRequest = mockHapiRequest({
      params: { slug: 'test-form' },
      auth: { credentials: { sbi: '123456789' } }
    })
    mockH = mockHapiResponseToolkit()

    findFormBySlug.mockReturnValue(mockForm)
    buildPrintViewModel.mockReturnValue({ test: 'viewModel' })
    mockReadFile.mockResolvedValue(JSON.stringify(mockDefinition))
  })

  test('should register GET /{slug}/print-submitted-application route', () => {
    const server = mockHapiServer()
    printSubmittedApplication.plugin.register(server)

    expect(server.route).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/{slug}/print-submitted-application'
      })
    )
  })

  test('should return 400 when slug is missing', async () => {
    mockRequest = mockHapiRequest({ params: {} })

    await handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith('Bad request - missing slug')
    expect(mockH.code).toHaveBeenCalledWith(400)
  })

  test('should return 404 when form is not found', async () => {
    findFormBySlug.mockReturnValue(null)

    await handler(mockRequest, mockH)

    expect(findFormBySlug).toHaveBeenCalledWith('test-form')
    expect(mockH.response).toHaveBeenCalledWith('Form not found')
    expect(mockH.code).toHaveBeenCalledWith(404)
  })

  test.each([
    ['application is not submitted', { applicationStatus: 'DRAFT' }],
    ['state is null', null]
  ])('should return 403 when %s', async (_desc, state) => {
    mockGetState.mockResolvedValue(state)

    await handler(mockRequest, mockH)

    expect(mockH.response).toHaveBeenCalledWith('Application not submitted')
    expect(mockH.code).toHaveBeenCalledWith(403)
  })

  test('should render print view for a submitted application', async () => {
    await handler(mockRequest, mockH)

    expect(findFormBySlug).toHaveBeenCalledWith('test-form')
    expect(mockGetState).toHaveBeenCalledWith(mockRequest)
    expect(mockReadFile).toHaveBeenCalledWith(mockForm.path, 'utf8')
    expect(buildPrintViewModel).toHaveBeenCalledWith({
      definition: mockDefinition,
      form: mockForm,
      answers: mockState,
      referenceNumber: 'REF-123',
      submittedAt: '2025-01-15T10:00:00.000Z',
      slug: 'test-form',
      sessionData: {
        contactName: 'Test User',
        businessName: 'Test Business',
        sbi: '123456789'
      }
    })
    expect(mockH.view).toHaveBeenCalledWith('print-submitted-application', { test: 'viewModel' })
  })

  test.each([
    ['REF-123', mockState],
    ['unknown', { ...mockState, $$__referenceNumber: undefined }]
  ])('should log success with referenceNumber "%s"', async (expectedRef, state) => {
    mockGetState.mockResolvedValue(state)

    await handler(mockRequest, mockH)

    expect(vi.mocked(log)).toHaveBeenCalledWith(
      LogCodes.PRINT_APPLICATION.SUCCESS,
      { referenceNumber: expectedRef },
      mockRequest
    )
  })

  test('should return 500 and log error when an exception occurs', async () => {
    mockReadFile.mockRejectedValue(new Error('File read failed'))
    mockRequest.auth = { credentials: { userId: 'user-42' } }

    await handler(mockRequest, mockH)

    expect(vi.mocked(log)).toHaveBeenCalledWith(
      LogCodes.PRINT_APPLICATION.ERROR,
      {
        userId: 'user-42',
        errorMessage: 'File read failed',
        slug: 'test-form'
      },
      mockRequest
    )
    expect(mockH.response).toHaveBeenCalledWith('Server error')
    expect(mockH.code).toHaveBeenCalledWith(500)
  })

  test('should use "unknown" userId when auth credentials are absent', async () => {
    mockReadFile.mockRejectedValue(new Error('Oops'))
    mockRequest.auth = {}

    await handler(mockRequest, mockH)

    expect(vi.mocked(log)).toHaveBeenCalledWith(
      LogCodes.PRINT_APPLICATION.ERROR,
      expect.objectContaining({ userId: 'unknown' }),
      mockRequest
    )
  })

  test('should handle missing applicant in state gracefully', async () => {
    const { applicant, ...stateWithoutApplicant } = mockState
    mockGetState.mockResolvedValue(stateWithoutApplicant)

    await handler(mockRequest, mockH)

    expect(buildPrintViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionData: {
          contactName: undefined,
          businessName: undefined,
          sbi: '123456789'
        }
      })
    )
  })
})
