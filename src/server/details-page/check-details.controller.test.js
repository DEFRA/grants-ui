import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import CheckDetailsController from './check-details.controller.js'
import { buildGraphQLQuery, mapResponse, processSections } from '../common/services/details-page/index.js'
import { executeConfigDrivenQuery } from '../common/services/consolidated-view/consolidated-view.service.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'

vi.mock('../common/services/details-page/index.js')
vi.mock('../common/services/consolidated-view/consolidated-view.service.js')
vi.mock('../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

const TEST_FORM_ENDPOINT = '/test-form'

const mockApiResponse = {
  data: {
    business: { name: 'Test Business' },
    customer: { name: { first: 'John', last: 'Doe' } }
  }
}

const mockMappedData = {
  businessName: 'Test Business',
  customerName: 'John Doe'
}

const mockSections = [
  {
    heading: 'Business Details',
    rows: [{ key: { text: 'Name' }, value: { text: 'Test Business' } }]
  }
]

const mockConfig = {
  query: {
    type: 'business',
    fields: ['name']
  },
  responseMapping: {
    businessName: 'business.name'
  },
  displaySections: [
    {
      heading: 'Business Details',
      fields: ['businessName']
    }
  ]
}

describe('CheckDetailsController', () => {
  let controller
  let mockModel
  let mockPageDef
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    mockModel = {
      basePath: TEST_FORM_ENDPOINT,
      def: {
        metadata: {
          detailsPage: mockConfig
        }
      }
    }

    mockPageDef = {
      path: '/check-details',
      title: 'Check your details'
    }

    controller = new CheckDetailsController(mockModel, mockPageDef)
    setupControllerMocks(controller)

    mockRequest = {
      app: {},
      auth: {
        isAuthenticated: true,
        credentials: {
          sbi: 'SBI123456',
          crn: '1100014934'
        }
      },
      payload: {}
    }

    mockContext = {
      state: { someState: 'value' }
    }

    mockH = {
      view: vi.fn().mockReturnValue('mocked-view')
    }

    // Mock the parent class method
    vi.spyOn(QuestionPageController.prototype, 'getViewModel').mockReturnValue({
      serviceName: 'Test Service',
      serviceUrl: TEST_FORM_ENDPOINT
    })

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default mocks
    vi.mocked(buildGraphQLQuery).mockReturnValue('query { business { name } }')
    vi.mocked(executeConfigDrivenQuery).mockResolvedValue(mockApiResponse)
    vi.mocked(mapResponse).mockReturnValue(mockMappedData)
    vi.mocked(processSections).mockReturnValue(mockSections)
  })

  describe('class properties', () => {
    it('should have correct viewName', () => {
      expect(controller.viewName).toBe('check-details')
    })

    it('should extend QuestionPageController', () => {
      expect(controller).toBeInstanceOf(QuestionPageController)
    })

    it('should store model reference', () => {
      expect(controller.model).toBe(mockModel)
    })
  })

  describe('makeGetRouteHandler', () => {
    it('should fetch and render view with sections on success', async () => {
      const handler = controller.makeGetRouteHandler()

      const result = await handler(mockRequest, mockContext, mockH)

      expect(buildGraphQLQuery).toHaveBeenCalledWith(mockConfig.query, mockRequest)
      expect(executeConfigDrivenQuery).toHaveBeenCalledWith(mockRequest, 'query { business { name } }')
      expect(mapResponse).toHaveBeenCalledWith(mockConfig.responseMapping, mockApiResponse)
      expect(processSections).toHaveBeenCalledWith(mockConfig.displaySections, mockMappedData, mockRequest)

      expect(mockRequest.app.detailsPageData).toEqual(mockMappedData)
      expect(mockH.view).toHaveBeenCalledWith('check-details', {
        serviceName: 'Test Service',
        serviceUrl: TEST_FORM_ENDPOINT,
        sections: mockSections,
        detailsCorrect: undefined
      })
      expect(result).toBe('mocked-view')
    })

    it('should pass detailsCorrect from state to the view', async () => {
      mockContext.state = { someState: 'value', detailsCorrect: 'true' }

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('check-details', {
        serviceName: 'Test Service',
        serviceUrl: TEST_FORM_ENDPOINT,
        sections: mockSections,
        detailsCorrect: 'true'
      })
      expect(result).toBe('mocked-view')
    })

    it('should call handleError on API error', async () => {
      const error = new Error('API unavailable')
      vi.mocked(executeConfigDrivenQuery).mockRejectedValue(error)

      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        { errorMessage: 'API unavailable' },
        mockRequest
      )
      expect(mockH.view).toHaveBeenCalledWith('check-details', {
        serviceName: 'Test Service',
        serviceUrl: TEST_FORM_ENDPOINT,
        error: {
          titleText: 'There is a problem',
          errorList: [{ text: 'Unable to retrieve your details. Please try again later.', href: '' }]
        }
      })
    })

    it('should call getViewModel with request and context', async () => {
      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(QuestionPageController.prototype.getViewModel).toHaveBeenCalledWith(mockRequest, mockContext)
    })
  })

  describe('makePostRouteHandler', () => {
    describe('validation - no radio selection', () => {
      it('should show validation error when no selection made', async () => {
        mockRequest.payload = {}

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(mockH.view).toHaveBeenCalledWith('check-details', {
          serviceName: 'Test Service',
          serviceUrl: TEST_FORM_ENDPOINT,
          sections: mockSections,
          errors: [{ text: 'Select yes if your details are correct', href: '#detailsCorrect' }]
        })
      })

      it('should log error and show validation error when API fails', async () => {
        mockRequest.payload = {}
        vi.mocked(executeConfigDrivenQuery).mockRejectedValue(new Error('API Error'))

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.EXTERNAL_API_ERROR, { errorMessage: 'API Error' }, mockRequest)
        expect(mockH.view).toHaveBeenCalledWith('check-details', {
          serviceName: 'Test Service',
          serviceUrl: TEST_FORM_ENDPOINT,
          errors: [{ text: 'Select yes if your details are correct', href: '#detailsCorrect' }]
        })
      })
    })

    describe('detailsCorrect = false', () => {
      it('should render incorrect-details view', async () => {
        mockRequest.payload = { detailsCorrect: 'false' }

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(mockH.view).toHaveBeenCalledWith('incorrect-details', {
          serviceName: 'Test Service',
          serviceUrl: TEST_FORM_ENDPOINT,
          continueUrl: TEST_FORM_ENDPOINT
        })
      })

      it('should save detailsCorrect to state and not call proceed', async () => {
        mockRequest.payload = { detailsCorrect: 'false' }

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
          someState: 'value',
          detailsCorrect: 'false'
        })
        expect(controller.proceed).not.toHaveBeenCalled()
      })
    })

    describe('detailsCorrect = true (success)', () => {
      it('should store applicant and detailsConfirmedAt in state and proceed', async () => {
        mockRequest.payload = { detailsCorrect: 'true' }
        const mockDate = new Date('2024-01-15T10:00:00.000Z')
        vi.setSystemTime(mockDate)

        const handler = controller.makePostRouteHandler()
        const result = await handler(mockRequest, mockContext, mockH)

        expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
          someState: 'value',
          applicant: mockMappedData,
          detailsCorrect: 'true',
          detailsConfirmedAt: '2024-01-15T10:00:00.000Z'
        })
        expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
        expect(result).toBe('redirected')

        vi.useRealTimers()
      })
    })

    describe('detailsCorrect = true with API error', () => {
      it('should log error and show error view when API fails', async () => {
        mockRequest.payload = { detailsCorrect: 'true' }
        const error = new Error('Data fetch failed')
        vi.mocked(executeConfigDrivenQuery).mockRejectedValue(error)

        const handler = controller.makePostRouteHandler()
        const result = await handler(mockRequest, mockContext, mockH)

        expect(log).toHaveBeenCalledWith(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          { errorMessage: 'Data fetch failed' },
          mockRequest
        )
        expect(controller.setState).not.toHaveBeenCalled()
        expect(controller.proceed).not.toHaveBeenCalled()
        expect(mockH.view).toHaveBeenCalledWith('check-details', {
          serviceName: 'Test Service',
          serviceUrl: TEST_FORM_ENDPOINT,
          error: {
            titleText: 'There is a problem',
            errorList: [{ text: 'Unable to save your details. Please try again later.', href: '' }]
          }
        })
        expect(result).toBe('mocked-view')
      })
    })
  })

  describe('fetchAndProcessData', () => {
    it('should build query, call API, map response, and process sections', async () => {
      const result = await controller.fetchAndProcessData(mockRequest, mockConfig)

      expect(buildGraphQLQuery).toHaveBeenCalledWith(mockConfig.query, mockRequest)
      expect(executeConfigDrivenQuery).toHaveBeenCalledWith(mockRequest, 'query { business { name } }')
      expect(mapResponse).toHaveBeenCalledWith(mockConfig.responseMapping, mockApiResponse)
      expect(processSections).toHaveBeenCalledWith(mockConfig.displaySections, mockMappedData, mockRequest)

      expect(result).toEqual({
        sections: mockSections,
        mappedData: mockMappedData
      })
    })

    it('should propagate errors from executeConfigDrivenQuery', async () => {
      const error = new Error('Query execution failed')
      vi.mocked(executeConfigDrivenQuery).mockRejectedValue(error)

      await expect(controller.fetchAndProcessData(mockRequest, mockConfig)).rejects.toThrow('Query execution failed')
    })

    it('should log and throw when response contains GraphQL errors', async () => {
      vi.mocked(executeConfigDrivenQuery).mockResolvedValue({
        errors: [{ message: 'Field not found' }]
      })

      await expect(controller.fetchAndProcessData(mockRequest, mockConfig)).rejects.toThrow('Field not found')
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        { errorMessage: 'Field not found' },
        mockRequest
      )
    })
  })

  describe('handleError', () => {
    it('should log error and return error view model', () => {
      const error = new Error('Test error message')
      const baseViewModel = { serviceName: 'Test Service', serviceUrl: '/test' }

      const result = controller.handleError(error, baseViewModel, mockH, mockRequest)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        { errorMessage: 'Test error message' },
        mockRequest
      )
      expect(mockH.view).toHaveBeenCalledWith('check-details', {
        serviceName: 'Test Service',
        serviceUrl: '/test',
        error: {
          titleText: 'There is a problem',
          errorList: [{ text: 'Unable to retrieve your details. Please try again later.', href: '' }]
        }
      })
      expect(result).toBe('mocked-view')
    })
  })

  describe('buildIncorrectDetailsViewModel', () => {
    it('should return view model with serviceName, serviceUrl, and continueUrl', () => {
      const baseViewModel = {
        serviceName: 'My Service',
        serviceUrl: '/my-service',
        otherProperty: 'ignored'
      }

      const result = controller.buildIncorrectDetailsViewModel(baseViewModel)

      expect(result).toEqual({
        serviceName: 'My Service',
        serviceUrl: '/my-service',
        continueUrl: '/my-service'
      })
    })
  })

  describe('edge cases', () => {
    it('should handle undefined payload in POST', async () => {
      mockRequest.payload = undefined

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'check-details',
        expect.objectContaining({
          errors: [{ text: 'Select yes if your details are correct', href: '#detailsCorrect' }]
        })
      )
    })

    it('should handle missing metadata gracefully in GET by showing config error', async () => {
      mockModel.def.metadata = undefined

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.CONFIG_MISSING,
        { missing: ['metadata.detailsPage'] },
        mockRequest
      )
      expect(mockH.view).toHaveBeenCalledWith('check-details', {
        serviceName: 'Test Service',
        serviceUrl: TEST_FORM_ENDPOINT,
        error: {
          titleText: 'There is a problem',
          errorList: [{ text: 'This page is not configured correctly. Please contact support.', href: '' }]
        }
      })
    })

    it('should handle missing metadata gracefully in POST by showing config error', async () => {
      mockModel.def.metadata = undefined
      mockRequest.payload = { detailsCorrect: 'true' }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.CONFIG_MISSING,
        { missing: ['metadata.detailsPage'] },
        mockRequest
      )
      expect(mockH.view).toHaveBeenCalledWith('check-details', {
        serviceName: 'Test Service',
        serviceUrl: TEST_FORM_ENDPOINT,
        error: {
          titleText: 'There is a problem',
          errorList: [{ text: 'This page is not configured correctly. Please contact support.', href: '' }]
        }
      })
    })

    it('should handle null context state', async () => {
      mockRequest.payload = { detailsCorrect: 'true' }
      mockContext.state = null

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          applicant: mockMappedData,
          detailsCorrect: 'true'
        })
      )
    })
  })
})
