import { vi } from 'vitest'
import { demoPrintApplicationHandler } from './demo-print-application.handler.js'
import {
  buildPrintViewModel,
  enrichDefinitionWithListItems
} from '../../common/helpers/print-application-service/print-application-service.js'
import { buildDemoData, buildDemoPayment, buildDemoPrintAnswers } from '../helpers/index.js'
import { generateFormNotFoundResponse, resolveFormDefinition } from '../utils/index.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { debug, LogCodes } from '../../common/helpers/logging/log.js'
import { MOCK_SINGLE_PAGE_DEFINITION } from '~/src/__test-fixtures__/mock-forms-cache.js'
import { MOCK_DEMO_DATA } from '../__test-fixtures__/mock-demo-data.js'

vi.mock('../../common/helpers/print-application-service/print-application-service.js')
vi.mock('../helpers/index.js')
vi.mock('../utils/index.js')
vi.mock('../../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

const mockDefinition = { ...MOCK_SINGLE_PAGE_DEFINITION, lists: [] }
const mockForm = {
  id: 'test-form',
  slug: 'test-form',
  title: mockDefinition.name ?? 'test-form',
  name: mockDefinition.name ?? 'test-form'
}

describe('demo-print-application.handler', () => {
  let mockRequest
  let mockGetFormService
  let mockFormService
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()

    mockFormService = vi.fn()
    mockGetFormService = vi.fn().mockReturnValue(mockFormService)
    mockRequest = mockHapiRequest({
      params: { slug: 'test-form' },
      server: { methods: { getFormService: mockGetFormService } }
    })
    mockH = mockHapiResponseToolkit()

    buildDemoData.mockReturnValue(MOCK_DEMO_DATA)
    buildDemoPrintAnswers.mockReturnValue({ field1: 'Demo text' })
    buildDemoPayment.mockReturnValue({ annualTotalPence: 100000, parcelItems: {} })
    enrichDefinitionWithListItems.mockImplementation((def) => def)
  })

  test('should render print page for valid form', async () => {
    resolveFormDefinition.mockResolvedValue(mockDefinition)
    buildPrintViewModel.mockReturnValue({ test: 'viewModel' })

    await demoPrintApplicationHandler(mockRequest, mockH)

    expect(resolveFormDefinition).toHaveBeenCalledWith(mockRequest)
    expect(enrichDefinitionWithListItems).toHaveBeenCalledWith(mockDefinition)
    expect(buildDemoPrintAnswers).toHaveBeenCalledWith(mockDefinition)
    expect(buildPrintViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        definition: mockDefinition,
        form: mockForm,
        answers: { field1: 'Demo text' },
        referenceNumber: 'DEMO123',
        slug: 'test-form',
        sessionData: {
          businessName: 'Demo Business Ltd',
          sbi: '999888777',
          contactName: 'Demo User'
        }
      })
    )
    expect(mockH.view).toHaveBeenCalledWith('print-submitted-application', { test: 'viewModel' })
  })

  test('should include demo payment data for farm-payments slug', async () => {
    mockRequest = mockHapiRequest({
      params: { slug: 'farm-payments' },
      server: { methods: { getFormService: mockGetFormService } }
    })
    resolveFormDefinition.mockResolvedValue(mockDefinition)
    buildPrintViewModel.mockReturnValue({ test: 'viewModel' })

    await demoPrintApplicationHandler(mockRequest, mockH)

    expect(buildPrintViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: { field1: 'Demo text', payment: { annualTotalPence: 100000, parcelItems: {} } }
      })
    )
  })

  test('should not include demo payment data for non-land-grant forms', async () => {
    resolveFormDefinition.mockResolvedValue(mockDefinition)
    buildPrintViewModel.mockReturnValue({ test: 'viewModel' })

    await demoPrintApplicationHandler(mockRequest, mockH)

    expect(buildPrintViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: { field1: 'Demo text' }
      })
    )
  })

  test('should return form not found response when form does not exist', async () => {
    resolveFormDefinition.mockResolvedValue(null)
    generateFormNotFoundResponse.mockResolvedValue('not-found-response')

    const result = await demoPrintApplicationHandler(mockRequest, mockH)

    expect(generateFormNotFoundResponse).toHaveBeenCalledWith('test-form', mockH)
    expect(result).toBe('not-found-response')
  })

  test('should handle errors with fallback HTML response', async () => {
    resolveFormDefinition.mockRejectedValue(new Error('Something broke'))

    await demoPrintApplicationHandler(mockRequest, mockH)

    expect(vi.mocked(debug)).toHaveBeenCalledWith(
      LogCodes.PRINT_APPLICATION.ERROR,
      expect.objectContaining({ slug: 'test-form', userId: 'demo' })
    )
    expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('Something broke'))
    expect(mockH.type).toHaveBeenCalledWith('text/html')
  })

  test('should pass submittedAt as ISO string', async () => {
    resolveFormDefinition.mockResolvedValue(mockDefinition)
    buildPrintViewModel.mockReturnValue({})

    await demoPrintApplicationHandler(mockRequest, mockH)

    const callArgs = buildPrintViewModel.mock.calls[0][0]
    expect(callArgs.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
