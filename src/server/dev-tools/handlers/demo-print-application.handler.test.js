import { vi } from 'vitest'
import { mockReadFile } from '~/src/__mocks__/fs-yaml-mocks.js'
import { demoPrintApplicationHandler } from './demo-print-application.handler.js'
import {
  findFormBySlug,
  buildPrintViewModel
} from '../../common/helpers/print-application-service/print-application-service.js'
import { buildDemoData, buildDemoPrintAnswers, enrichDefinitionWithListItems } from '../helpers/index.js'
import { generateFormNotFoundResponse } from '../utils/index.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { log, LogCodes } from '../../common/helpers/logging/log.js'
import { MOCK_FORM_WITH_PATH, MOCK_SINGLE_PAGE_DEFINITION } from '~/src/__test-fixtures__/mock-forms-cache.js'

vi.mock('../../common/helpers/print-application-service/print-application-service.js')
vi.mock('../helpers/index.js')
vi.mock('../utils/index.js')
vi.mock('../../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

const mockDemoData = {
  referenceNumber: 'DEMO123',
  businessName: 'Demo Business Ltd',
  sbi: '999888777',
  contactName: 'Demo User'
}

const mockDefinition = { ...MOCK_SINGLE_PAGE_DEFINITION, lists: [] }
const mockForm = MOCK_FORM_WITH_PATH

describe('demo-print-application.handler', () => {
  let mockRequest
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()

    mockRequest = mockHapiRequest({ params: { slug: 'test-form' } })
    mockH = mockHapiResponseToolkit()

    buildDemoData.mockReturnValue(mockDemoData)
    buildDemoPrintAnswers.mockReturnValue({ field1: 'Demo text' })
    enrichDefinitionWithListItems.mockImplementation((def) => def)
    mockReadFile.mockResolvedValue(JSON.stringify(mockDefinition))
  })

  test('should render print page for valid form', async () => {
    findFormBySlug.mockReturnValue(mockForm)
    buildPrintViewModel.mockReturnValue({ test: 'viewModel' })

    await demoPrintApplicationHandler(mockRequest, mockH)

    expect(findFormBySlug).toHaveBeenCalledWith('test-form')
    expect(mockReadFile).toHaveBeenCalledWith(mockForm.path, 'utf8')
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

  test('should return form not found response when form does not exist', async () => {
    findFormBySlug.mockReturnValue(null)
    generateFormNotFoundResponse.mockReturnValue('not-found-response')

    const result = await demoPrintApplicationHandler(mockRequest, mockH)

    expect(generateFormNotFoundResponse).toHaveBeenCalledWith('test-form', mockH)
    expect(result).toBe('not-found-response')
  })

  test('should handle errors with fallback HTML response', async () => {
    findFormBySlug.mockImplementation(() => {
      throw new Error('Something broke')
    })

    await demoPrintApplicationHandler(mockRequest, mockH)

    expect(vi.mocked(log)).toHaveBeenCalledWith(
      LogCodes.PRINT_APPLICATION.ERROR,
      expect.objectContaining({ slug: 'test-form', userId: 'demo' })
    )
    expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('Something broke'))
    expect(mockH.type).toHaveBeenCalledWith('text/html')
  })

  test('should pass submittedAt as ISO string', async () => {
    findFormBySlug.mockReturnValue(mockForm)
    buildPrintViewModel.mockReturnValue({})

    await demoPrintApplicationHandler(mockRequest, mockH)

    const callArgs = buildPrintViewModel.mock.calls[0][0]
    expect(callArgs.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
