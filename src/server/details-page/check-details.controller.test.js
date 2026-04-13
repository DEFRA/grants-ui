import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import CheckDetailsController from './check-details.controller.js'
import { buildGraphQLQuery, mapResponse, processSections } from '../common/services/details-page/index.js'
import {
  executeConfigDrivenQuery,
  hasOnlyToleratedFailures
} from '../common/services/consolidated-view/consolidated-view.service.js'
import { debug, log, LogCodes } from '../common/helpers/logging/log.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
import { config } from '~/src/config/config.js'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

vi.mock('@defra/forms-model', () => ({
  ComponentType: {
    Html: 'Html',
    RadiosField: 'RadiosField'
  }
}))

vi.mock('../common/services/details-page/index.js')
vi.mock('../common/services/consolidated-view/consolidated-view.service.js')
vi.mock('../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => {
  return {
    QuestionPageController: class {
      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
        this.collection = {
          getViewErrors: vi.fn((errors) => errors)
        }
      }

      getViewModel(request, context) {
        return {
          serviceName: 'Test Service',
          serviceUrl: '/test-form'
        }
      }

      setState() {
        return Promise.resolve()
      }

      proceed() {
        return 'redirected'
      }

      getNextPath() {
        return '/next-path'
      }

      filterConditionalComponents() {
        return []
      }
    }
  }
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
      lists: [],
      def: {
        metadata: {
          detailsPage: mockConfig,
          toleratedFailurePaths: ['countyParishHoldings']
        }
      }
    }

    mockPageDef = {
      path: '/check-details',
      title: 'Check your details',
      components: []
    }

    controller = new CheckDetailsController(mockModel, mockPageDef)
    setupControllerMocks(controller)

    mockRequest = {
      app: {},
      path: '/test-form/check-details',
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
      state: { someState: 'value' },
      payload: {},
      errors: null,
      evaluationState: {}
    }

    mockH = {
      view: vi.fn().mockReturnValue('mocked-view')
    }

    // Reset all mocks
    vi.clearAllMocks()

    // Re-setup controller mocks after clearAllMocks
    setupControllerMocks(controller)

    // Setup default mocks
    vi.mocked(buildGraphQLQuery).mockReturnValue('query { business { name } }')
    vi.mocked(executeConfigDrivenQuery).mockResolvedValue(mockApiResponse)
    vi.mocked(hasOnlyToleratedFailures).mockReturnValue(false)
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

    it('should set confirmationFieldName from metadata', () => {
      const modelWithFieldName = {
        ...mockModel,
        lists: [],
        def: { metadata: { detailsPage: { ...mockConfig, confirmationFieldName: 'myConfirmField' } } }
      }
      const ctrl = new CheckDetailsController(modelWithFieldName, mockPageDef)
      expect(ctrl.confirmationFieldName).toBe('myConfirmField')
    })

    it('should default confirmationFieldName to detailsConfirmed when not in metadata', () => {
      const modelWithoutFieldName = {
        ...mockModel,
        lists: [],
        def: { metadata: { detailsPage: mockConfig } }
      }
      const ctrl = new CheckDetailsController(modelWithoutFieldName, mockPageDef)
      expect(ctrl.confirmationFieldName).toBe('detailsConfirmed')
    })

    it('should inject yesNo list into model if not present', () => {
      expect(mockModel.lists.some((l) => l.name === 'yesNo')).toBe(true)
    })

    it('should not duplicate yesNo list if already present', () => {
      const modelWithYesNo = {
        ...mockModel,
        lists: [{ name: 'yesNo' }],
        def: { metadata: { detailsPage: mockConfig } }
      }
      const ctrl = new CheckDetailsController(modelWithYesNo, mockPageDef)
      expect(ctrl).toBeDefined()
      expect(modelWithYesNo.lists.filter((l) => l.name === 'yesNo')).toHaveLength(1)
    })

    it('should patch pageDef with Html placeholder and RadiosField components', () => {
      expect(controller.pageDef.components).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'Html', name: 'placeholder' }),
          expect.objectContaining({ type: 'RadiosField', name: 'detailsConfirmed' })
        ])
      )
    })
  })

  describe('makeGetRouteHandler', () => {
    it('should fetch and render view with sections on success', async () => {
      const handler = controller.makeGetRouteHandler()

      const result = await handler(mockRequest, mockContext, mockH)

      expect(buildGraphQLQuery).toHaveBeenCalledWith(mockConfig.query, mockRequest)
      expect(executeConfigDrivenQuery).toHaveBeenCalledWith(mockRequest, 'query { business { name } }', {
        toleratedPaths: ['countyParishHoldings']
      })
      expect(mapResponse).toHaveBeenCalledWith(mockConfig.responseMapping, mockApiResponse)
      expect(processSections).toHaveBeenCalledWith(mockConfig.displaySections, mockMappedData, mockRequest)

      expect(mockRequest.app.detailsPageData).toEqual(mockMappedData)
      expect(mockH.view).toHaveBeenCalledWith('check-details', {
        serviceName: 'Test Service',
        serviceUrl: TEST_FORM_ENDPOINT,
        sections: mockSections
      })
      expect(result).toBe('mocked-view')
    })

    it('should call handleError on API error', async () => {
      const error = new Error('API unavailable')
      vi.mocked(executeConfigDrivenQuery).mockRejectedValue(error)

      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(debug).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        { endpoint: 'ConsolidatedView', errorMessage: 'API unavailable' },
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
      const getViewModelSpy = vi.spyOn(QuestionPageController.prototype, 'getViewModel')
      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(getViewModelSpy).toHaveBeenCalledWith(mockRequest, mockContext)
    })

    it('should handle missing config by showing config error', async () => {
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
  })

  describe('makePostRouteHandler', () => {
    describe('with context.errors (validation errors from framework)', () => {
      it('should render view with sections and filtered components on validation errors', async () => {
        mockContext.errors = [{ text: 'Select yes if your details are correct' }]
        mockContext.payload = {}

        const getViewModelSpy = vi.spyOn(controller, 'getViewModel').mockReturnValue({
          serviceName: 'Test Service',
          serviceUrl: TEST_FORM_ENDPOINT,
          errors: [{ text: 'Select yes if your details are correct' }],
          components: []
        })
        controller.collection = { getViewErrors: vi.fn((e) => e) }

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(mockH.view).toHaveBeenCalledWith(
          'check-details',
          expect.objectContaining({
            sections: mockSections
          })
        )
        getViewModelSpy.mockRestore()
      })
    })

    describe('confirmationValue === false (user says details are wrong)', () => {
      it('should save state and render incorrect-details view', async () => {
        mockContext.payload = { detailsConfirmed: false }

        const handler = controller.makePostRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(controller.setState).toHaveBeenCalledWith(mockRequest, { someState: 'value' })
        expect(mockH.view).toHaveBeenCalledWith(
          'incorrect-details',
          expect.objectContaining({
            serviceName: 'Test Service',
            serviceUrl: TEST_FORM_ENDPOINT,
            continueUrl: '/test-form/check-details',
            backLink: { text: 'Back', href: '/test-form/check-details' }
          })
        )
        expect(controller.proceed).not.toHaveBeenCalled()
      })
    })

    describe('confirmationValue is truthy (user confirms details)', () => {
      it('should call handleDetailsConfirmed and proceed', async () => {
        mockContext.payload = { detailsConfirmed: true }
        const mockDate = new Date('2024-01-15T10:00:00.000Z')
        vi.setSystemTime(mockDate)

        const handler = controller.makePostRouteHandler()
        const result = await handler(mockRequest, mockContext, mockH)

        expect(controller.setState).toHaveBeenCalledTimes(2)
        // First setState saves state
        expect(controller.setState).toHaveBeenNthCalledWith(1, mockRequest, { someState: 'value' })
        // Second setState in handleDetailsConfirmed
        expect(controller.setState).toHaveBeenNthCalledWith(2, mockRequest, {
          someState: 'value',
          additionalAnswers: {
            applicant: mockMappedData,
            detailsConfirmedAt: '2024-01-15T10:00:00.000Z'
          }
        })
        expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
        expect(result).toBe('redirected')

        vi.useRealTimers()
      })
    })

    describe('missing config in POST', () => {
      it('should show config error when metadata is undefined', async () => {
        mockModel.def.metadata = undefined
        mockContext.payload = { detailsConfirmed: true }

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
    })
  })

  describe('handleDetailsConfirmed', () => {
    it('should store applicant in state and proceed', async () => {
      const mockDate = new Date('2024-01-15T10:00:00.000Z')
      vi.setSystemTime(mockDate)

      await controller.handleDetailsConfirmed(mockRequest, mockContext, mockConfig, mockH)

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        someState: 'value',
        additionalAnswers: {
          applicant: mockMappedData,
          detailsConfirmedAt: '2024-01-15T10:00:00.000Z'
        }
      })
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')

      vi.useRealTimers()
    })

    it('should log error and show error view when API fails', async () => {
      const error = new Error('Data fetch failed')
      vi.mocked(executeConfigDrivenQuery).mockRejectedValue(error)

      const result = await controller.handleDetailsConfirmed(mockRequest, mockContext, mockConfig, mockH)

      expect(debug).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        { endpoint: 'ConsolidatedView', errorMessage: 'Data fetch failed' },
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

    it('should handle null context state', async () => {
      mockContext.state = null

      await controller.handleDetailsConfirmed(mockRequest, mockContext, mockConfig, mockH)

      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          additionalAnswers: expect.objectContaining({
            applicant: mockMappedData
          })
        })
      )
    })
  })

  describe('fetchAndProcessData', () => {
    it('should build query, call API, map response, and process sections', async () => {
      const result = await controller.fetchAndProcessData(mockRequest, mockConfig)

      expect(buildGraphQLQuery).toHaveBeenCalledWith(mockConfig.query, mockRequest)
      expect(executeConfigDrivenQuery).toHaveBeenCalledWith(mockRequest, 'query { business { name } }', {
        toleratedPaths: ['countyParishHoldings']
      })
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

    it('should log and throw when response contains non-tolerated GraphQL errors', async () => {
      vi.mocked(executeConfigDrivenQuery).mockResolvedValue({
        errors: [{ message: 'Field not found' }]
      })
      vi.mocked(hasOnlyToleratedFailures).mockReturnValue(false)

      await expect(controller.fetchAndProcessData(mockRequest, mockConfig)).rejects.toThrow('Field not found')
      expect(hasOnlyToleratedFailures).toHaveBeenCalledWith([{ message: 'Field not found' }], ['countyParishHoldings'])
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        { endpoint: 'ConsolidatedView', errorMessage: 'Field not found' },
        mockRequest
      )
    })

    it('should continue processing when response contains only tolerated GraphQL errors', async () => {
      const partialResponse = {
        data: {
          business: { name: 'Test Business' },
          customer: { name: { first: 'John', last: 'Doe' } }
        },
        errors: [{ message: 'Forbidden', path: ['business', 'countyParishHoldings'] }]
      }
      vi.mocked(executeConfigDrivenQuery).mockResolvedValue(partialResponse)
      vi.mocked(hasOnlyToleratedFailures).mockReturnValue(true)

      const result = await controller.fetchAndProcessData(mockRequest, mockConfig)

      expect(hasOnlyToleratedFailures).toHaveBeenCalledWith(partialResponse.errors, ['countyParishHoldings'])
      expect(log).toHaveBeenCalledWith(
        LogCodes.SYSTEM.CONSOLIDATED_VIEW_PARTIAL_SUCCESS,
        expect.objectContaining({
          sbi: 'SBI123456',
          failedPaths: 'business.countyParishHoldings'
        }),
        mockRequest
      )
      expect(mapResponse).toHaveBeenCalledWith(mockConfig.responseMapping, partialResponse)
      expect(result).toEqual({ sections: mockSections, mappedData: mockMappedData })
    })
  })

  describe('handleError', () => {
    it('should log error and return error view model', () => {
      const error = new Error('Test error message')
      const baseViewModel = { serviceName: 'Test Service', serviceUrl: '/test' }

      const result = controller.handleError(error, baseViewModel, mockH, mockRequest)

      expect(debug).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        { endpoint: 'ConsolidatedView', errorMessage: 'Test error message' },
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
    beforeEach(() => {
      vi.resetAllMocks()
      vi.mocked(config.get).mockImplementation((key) => {
        if (key === 'externalLinks.sfd.enabled') {
          return true
        }
        if (key === 'externalLinks.sfd.updateUrl') {
          return 'https://sfd-test.example.com/update'
        }
        return undefined
      })
    })

    it('should return view model with serviceName, serviceUrl, continueUrl and backLink', () => {
      const baseViewModel = {
        serviceName: 'My Service',
        serviceUrl: '/my-service',
        otherProperty: 'ignored'
      }

      const result = controller.buildIncorrectDetailsViewModel(baseViewModel, {
        path: '/my-service/check-details',
        auth: {
          credentials: { sbi: 'SBI1234' }
        }
      })

      expect(result).toEqual({
        serviceName: 'My Service',
        serviceUrl: '/my-service',
        continueUrl: '/my-service/check-details',
        updateThroughSFDUrl: 'https://sfd-test.example.com/update?ssoOrgId=SBI1234',
        isSFDUpdateEnabled: true,
        backLink: { text: 'Back', href: '/my-service/check-details' }
      })
    })

    it('should return undefined for updateThroughSFDUrl when SFD is disabled', () => {
      vi.mocked(config.get).mockImplementation((key) => {
        if (key === 'externalLinks.sfd.enabled') {
          return false
        }
        return undefined
      })

      const baseViewModel = { serviceName: 'My Service', serviceUrl: '/my-service' }
      const request = { path: '/path', auth: { credentials: { sbi: 'SBI1234' } } }

      const result = controller.buildIncorrectDetailsViewModel(baseViewModel, request)
      expect(result.updateThroughSFDUrl).toBeUndefined()
      expect(result.isSFDUpdateEnabled).toBe(false)
    })

    it('should return empty string and log debug when updateUrl is invalid', () => {
      vi.mocked(config.get).mockImplementation((key) => {
        if (key === 'externalLinks.sfd.enabled') {
          return true
        }
        if (key === 'externalLinks.sfd.updateUrl') {
          return 'not-a-url'
        }
        return undefined
      })

      const baseViewModel = { serviceName: 'My Service', serviceUrl: '/my-service' }
      const request = { path: '/path', auth: { credentials: { sbi: 'SBI1234' } } }

      const result = controller.buildIncorrectDetailsViewModel(baseViewModel, request)
      expect(result.updateThroughSFDUrl).toBe('')
      expect(debug).toHaveBeenCalledWith(
        LogCodes.SYSTEM.CONFIG_INVALID,
        { key: 'externalLinks.sfd.updateUrl', value: 'not-a-url' },
        request
      )
    })

    it('should return empty string when updateUrl is missing', () => {
      vi.mocked(config.get).mockImplementation((key) => {
        if (key === 'externalLinks.sfd.enabled') {
          return true
        }
        if (key === 'externalLinks.sfd.updateUrl') {
          return ''
        }
        return undefined
      })

      const baseViewModel = { serviceName: 'My Service', serviceUrl: '/my-service' }
      const request = { path: '/path', auth: { credentials: { sbi: 'SBI1234' } } }

      const result = controller.buildIncorrectDetailsViewModel(baseViewModel, request)
      expect(result.updateThroughSFDUrl).toBe('')
    })
  })
})
