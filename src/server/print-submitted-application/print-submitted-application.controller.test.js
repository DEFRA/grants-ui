import { vi } from 'vitest'
import { mockReadFile } from '~/src/__mocks__/fs-yaml-mocks.js'
import { printSubmittedApplication } from './print-submitted-application.controller.js'
import { findFormBySlug } from '../common/forms/services/find-form-by-slug.js'
import {
  buildPrintViewModel,
  processConfigurablePrintContent
} from '../common/helpers/print-application-service/print-application-service.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { mockHapiRequest, mockHapiResponseToolkit, mockHapiServer } from '~/src/__mocks__/hapi-mocks.js'
import { MOCK_FORM_WITH_PATH, MOCK_SINGLE_PAGE_DEFINITION } from '~/src/__test-fixtures__/mock-forms-cache.js'
import { fetchBusinessAndCustomerInformation } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { createPersonRows, createBusinessRows, createContactRows } from '~/src/server/common/helpers/create-rows.js'

vi.mock('../common/forms/services/find-form-by-slug.js')
vi.mock('../common/helpers/print-application-service/print-application-service.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js')
vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js')
vi.mock('~/src/server/common/helpers/create-rows.js')
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
      },
      configurablePrintContent: undefined,
      applicantDetailsSections: null
    })
    expect(processConfigurablePrintContent).toHaveBeenCalledWith(undefined, 'test-form')
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

  test('should pass payment data through to buildPrintViewModel via answers', async () => {
    const stateWithPayment = {
      ...mockState,
      payment: {
        annualTotalPence: 100000,
        parcelItems: {
          item1: {
            sheetId: 'AB',
            parcelId: '001',
            code: 'X1',
            description: 'Test',
            quantity: '5',
            annualPaymentPence: 100000
          }
        }
      }
    }
    mockGetState.mockResolvedValue(stateWithPayment)

    await handler(mockRequest, mockH)

    expect(buildPrintViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: stateWithPayment
      })
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

  describe('applicant details sections', () => {
    const mockPersonRows = { rows: [{ key: { text: 'First name' }, value: { text: 'Test' } }] }
    const mockBusinessRows = { rows: [{ key: { text: 'Business name' }, value: { text: 'Test Business' } }] }
    const mockContactRows = { rows: [{ key: { text: 'Email address' }, value: { text: 'test@example.com' } }] }
    const definitionWithApplicantDetails = JSON.stringify({
      ...mockDefinition,
      metadata: { printPage: { showApplicantDetails: true } }
    })

    const fetchedData = {
      customer: { name: { title: 'Mr', first: 'Fetched', last: 'User' } },
      business: { name: 'Fetched Business' }
    }

    beforeEach(() => {
      vi.mocked(createPersonRows).mockReturnValue(mockPersonRows)
      vi.mocked(createBusinessRows).mockReturnValue(mockBusinessRows)
      vi.mocked(createContactRows).mockReturnValue(mockContactRows)
    })

    test.each([
      {
        desc: 'state has applicant — uses state data',
        state: mockState,
        expectedPersonArg: mockState.applicant.customer.name,
        expectedBusinessArg: mockState.applicant.business,
        shouldFetch: false
      },
      {
        desc: 'state.applicant is empty — fetches from API',
        state: { ...mockState, applicant: {} },
        expectedPersonArg: fetchedData.customer.name,
        expectedBusinessArg: fetchedData.business,
        shouldFetch: true
      }
    ])(
      'should resolve applicant details when $desc',
      async ({ state, expectedPersonArg, expectedBusinessArg, shouldFetch }) => {
        mockGetState.mockResolvedValue(state)
        mockReadFile.mockResolvedValue(definitionWithApplicantDetails)
        if (shouldFetch) {
          vi.mocked(fetchBusinessAndCustomerInformation).mockResolvedValue(fetchedData)
        }

        await handler(mockRequest, mockH)

        if (shouldFetch) {
          expect(fetchBusinessAndCustomerInformation).toHaveBeenCalledWith(mockRequest)
        } else {
          expect(fetchBusinessAndCustomerInformation).not.toHaveBeenCalled()
        }
        expect(createPersonRows).toHaveBeenCalledWith(expectedPersonArg)
        expect(createBusinessRows).toHaveBeenCalledWith('123456789', expectedBusinessArg)
        expect(createContactRows).toHaveBeenCalledWith(expectedBusinessArg)
        expect(buildPrintViewModel).toHaveBeenCalledWith(
          expect.objectContaining({
            applicantDetailsSections: {
              person: mockPersonRows,
              business: mockBusinessRows,
              contact: mockContactRows
            }
          })
        )
      }
    )

    test('should return null applicantDetailsSections when fetch fails', async () => {
      mockGetState.mockResolvedValue({ ...mockState, applicant: {} })
      mockReadFile.mockResolvedValue(definitionWithApplicantDetails)
      vi.mocked(fetchBusinessAndCustomerInformation).mockRejectedValue(new Error('API failure'))

      await handler(mockRequest, mockH)

      expect(buildPrintViewModel).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantDetailsSections: null
        })
      )
      expect(vi.mocked(log)).toHaveBeenCalledWith(
        LogCodes.PRINT_APPLICATION.ERROR,
        expect.objectContaining({
          errorMessage: expect.stringContaining('Failed to fetch applicant details')
        }),
        mockRequest
      )
    })

    test('should pass null applicantDetailsSections when showApplicantDetails is not set', async () => {
      await handler(mockRequest, mockH)

      expect(fetchBusinessAndCustomerInformation).not.toHaveBeenCalled()
      expect(createPersonRows).not.toHaveBeenCalled()
      expect(buildPrintViewModel).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantDetailsSections: null
        })
      )
    })
  })

  test('should process configurablePrintContent when metadata is present', async () => {
    processConfigurablePrintContent.mockReturnValue({ html: '<p>Processed</p>' })
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        ...mockDefinition,
        metadata: { printPage: { configurablePrintContent: { html: '<p>Raw</p>' } } }
      })
    )

    await handler(mockRequest, mockH)

    expect(processConfigurablePrintContent).toHaveBeenCalledWith({ html: '<p>Raw</p>' }, 'test-form')
    expect(buildPrintViewModel).toHaveBeenCalledWith(
      expect.objectContaining({ configurablePrintContent: { html: '<p>Processed</p>' } })
    )
  })
})
