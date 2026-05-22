import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import CheckDetailsController, { UpdateDetailsPageController } from './check-details.controller.js'
import { buildGraphQLQuery, mapResponse, processSections } from '../common/services/details-page/index.js'
import {
  executeConfigDrivenQuery,
  hasOnlyToleratedFailures
} from '../common/services/consolidated-view/consolidated-view.service.js'
import { debug, log, LogCodes } from '../common/helpers/logging/log.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
import { config } from '~/src/config/config.js'
import { findFormBySlug } from '~/src/server/common/forms/services/find-form-by-slug.js'
import { mockContext } from '~/src/__mocks__/index.js'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'externalLinks.sfd.enabled') {
        return false
      }
      if (key === 'externalLinks.sfd.updateUrl') {
        return 'http://localhost:3000/sfd/update-sbi'
      }
      return undefined
    })
  }
}))

vi.mock('@defra/forms-model', () => ({
  ComponentType: {
    Html: 'Html',
    RadiosField: 'RadiosField'
  },
  ControllerType: {
    Terminal: 'SomeTerminalController'
  }
}))

vi.mock('~/src/server/common/forms/services/find-form-by-slug.js')

vi.mock('@defra/forms-engine-plugin/controllers/TerminalPageController.js', () => ({
  TerminalPageController: class {
    constructor(model, pageDef) {
      this.model = model
      this.pageDef = pageDef
      this.path = pageDef.path
      this.collection = { components: [] }
    }

    makeGetRouteHandler() {
      return async () => 'terminal-get'
    }

    makePostRouteHandler() {
      throw new Error('POST method not allowed for terminal pages')
    }
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
    // Reset all mocks FIRST so controller is constructed with correct config state
    vi.clearAllMocks()

    // Restore default config.get mock before constructing controller
    vi.mocked(config.get).mockImplementation((key) => {
      if (key === 'externalLinks.sfd.enabled') {
        return false
      }
      if (key === 'externalLinks.sfd.updateUrl') {
        return 'http://localhost:3000/sfd/update-sbi'
      }
      return undefined
    })

    mockModel = {
      basePath: TEST_FORM_ENDPOINT,
      lists: [],
      pages: [],
      pageMap: new Map(),
      conditions: {},
      def: {
        pages: [],
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

    // Setup default mocks
    vi.mocked(buildGraphQLQuery).mockReturnValue('query { business { name } }')
    vi.mocked(executeConfigDrivenQuery).mockResolvedValue(mockApiResponse)
    vi.mocked(hasOnlyToleratedFailures).mockReturnValue(false)
    vi.mocked(mapResponse).mockReturnValue(mockMappedData)
    vi.mocked(processSections).mockReturnValue(mockSections)

    mockRequest = {
      app: {},
      path: '/test-form/check-details',
      params: { slug: 'test-form' },
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
      view: vi.fn().mockReturnValue('mocked-view'),
      redirect: vi.fn().mockReturnValue('mocked-redirect')
    }
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

    it('should handle missing components in pageDef during patching', () => {
      const pageDefWithoutComponents = {
        path: '/check-details',
        title: 'Check your details'
      }
      const ctrl = new CheckDetailsController(mockModel, pageDefWithoutComponents)
      expect(ctrl.pageDef.components).toHaveLength(2)
      expect(ctrl.pageDef.components[0].name).toBe('placeholder')
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
      it('should save state and proceed via getNextPath (update-details via condition)', async () => {
        mockContext.payload = { detailsConfirmed: false }
        mockRequest.params = { slug: 'test-form' }

        const handler = controller.makePostRouteHandler()
        const result = await handler(mockRequest, mockContext, mockH)

        expect(controller.setState).toHaveBeenCalledWith(mockRequest, { someState: 'value' })
        expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
        expect(mockH.view).not.toHaveBeenCalled()
        expect(result).toBe('redirected')
      })

      it('should redirect directly to SFD URL without saving state when sfd.enabled is true', async () => {
        vi.mocked(config.get).mockImplementation((key) => {
          if (key === 'externalLinks.sfd.enabled') {
            return true
          }
          if (key === 'externalLinks.sfd.updateUrl') {
            return 'http://localhost:3000/sfd/update-sbi'
          }
          return undefined
        })
        // isSfdEnabled is captured at construction time, so create a new controller with sfd enabled
        const sfdModel = { ...mockModel, lists: [], pages: [], def: { ...mockModel.def, pages: [] } }
        const sfdController = new CheckDetailsController(sfdModel, mockPageDef)
        setupControllerMocks(sfdController)
        mockContext.payload = { detailsConfirmed: false }
        mockRequest.auth = { credentials: { currentRelationshipId: 'REL123' } }

        const handler = sfdController.makePostRouteHandler()
        const result = await handler(mockRequest, mockContext, mockH)

        expect(sfdController.setState).toHaveBeenCalledWith(
          mockRequest,
          expect.objectContaining({ checkDetailsChangesPending: true })
        )
        expect(sfdController.setState).toHaveBeenCalledWith(
          mockRequest,
          expect.not.objectContaining({ detailsConfirmed: expect.anything() })
        )
        expect(mockH.redirect).toHaveBeenCalledWith('http://localhost:3000/sfd/update-sbi?ssoOrgId=REL123')
        expect(sfdController.proceed).not.toHaveBeenCalled()
        expect(result).toBe('mocked-redirect')
      })

      it('should fall through to save state and proceed when sfd.enabled is true but updateUrl is falsy', async () => {
        vi.mocked(config.get).mockImplementation((key) => {
          if (key === 'externalLinks.sfd.enabled') {
            return true
          }
          if (key === 'externalLinks.sfd.updateUrl') {
            return ''
          }
          return undefined
        })
        // isSfdEnabled is captured at construction time, so create a new controller with sfd enabled
        const sfdModel = { ...mockModel, lists: [], pages: [], def: { ...mockModel.def, pages: [] } }
        const sfdController = new CheckDetailsController(sfdModel, mockPageDef)
        setupControllerMocks(sfdController)
        mockContext.payload = { detailsConfirmed: false }
        mockRequest.auth = { credentials: { currentRelationshipId: 'REL123' } }

        const handler = sfdController.makePostRouteHandler()
        const result = await handler(mockRequest, mockContext, mockH)

        expect(mockH.redirect).not.toHaveBeenCalled()
        expect(sfdController.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
        expect(result).toBe('redirected')
      })

      it('should fall through to save state and proceed when sfd.enabled is true but updateUrl is malformed', async () => {
        vi.mocked(config.get).mockImplementation((key) => {
          if (key === 'externalLinks.sfd.enabled') {
            return true
          }
          if (key === 'externalLinks.sfd.updateUrl') {
            return 'not-a-valid-url'
          }
          return undefined
        })
        // isSfdEnabled is captured at construction time, so create a new controller with sfd enabled
        const sfdModel = { ...mockModel, lists: [], pages: [], def: { ...mockModel.def, pages: [] } }
        const sfdController = new CheckDetailsController(sfdModel, mockPageDef)
        setupControllerMocks(sfdController)
        mockContext.payload = { detailsConfirmed: false }
        mockRequest.auth = { credentials: { currentRelationshipId: 'REL123' } }

        const handler = sfdController.makePostRouteHandler()
        const result = await handler(mockRequest, mockContext, mockH)

        expect(mockH.redirect).not.toHaveBeenCalled()
        expect(sfdController.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
        expect(result).toBe('redirected')
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

    it('should use toleratedFailurePaths from detailsConfig if present', async () => {
      const configWithToleratedPaths = {
        ...mockConfig,
        toleratedFailurePaths: ['customPath']
      }
      vi.mocked(executeConfigDrivenQuery).mockResolvedValue({
        errors: [{ message: 'Error' }]
      })
      vi.mocked(hasOnlyToleratedFailures).mockReturnValue(true)

      await controller.fetchAndProcessData(mockRequest, configWithToleratedPaths)

      expect(executeConfigDrivenQuery).toHaveBeenCalledWith(mockRequest, expect.any(String), {
        toleratedPaths: ['customPath']
      })
      expect(hasOnlyToleratedFailures).toHaveBeenCalledWith(expect.any(Array), ['customPath'])
    })
  })

  describe('ensureUpdateDetailsPage', () => {
    it('should inject update-details terminal page into model.pages', () => {
      controller.ensureUpdateDetailsPage()
      expect(mockModel.pages.some((p) => p.path === '/update-details')).toBe(true)
    })

    it('should inject update-details page def into model.def.pages', () => {
      controller.ensureUpdateDetailsPage()
      expect(mockModel.def.pages.some((p) => p.path === '/update-details')).toBe(true)
    })

    it('should insert update-details immediately after check-details in model.pages', () => {
      // Add a status page after check-details to simulate the engine's auto-added status page
      const statusPage = { path: '/status' }
      mockModel.pages.push(controller)
      mockModel.pages.push(statusPage)

      controller.ensureUpdateDetailsPage()

      const pages = mockModel.pages
      const checkDetailsIndex = pages.indexOf(controller)
      const updateDetailsIndex = pages.findIndex((p) => p.path === '/update-details')
      expect(updateDetailsIndex).toBe(checkDetailsIndex + 1)
      // Status page should still be after update-details
      expect(pages.indexOf(statusPage)).toBe(updateDetailsIndex + 1)
    })

    it('should not inject update-details when sfd.enabled is true', () => {
      vi.mocked(config.get).mockImplementation((key) => {
        if (key === 'externalLinks.sfd.enabled') {
          return true
        }
        return undefined
      })

      // isSfdEnabled is captured at construction time, so create a new controller with sfd enabled
      const sfdModel = {
        ...mockModel,
        lists: [],
        pages: [],
        def: { ...mockModel.def, pages: [] }
      }
      const sfdController = new CheckDetailsController(sfdModel, mockPageDef)
      sfdController.ensureUpdateDetailsPage()

      expect(sfdModel.pages.some((p) => p.path === '/update-details')).toBe(false)
      expect(sfdModel.def.pages.some((p) => p.path === '/update-details')).toBe(false)
    })

    it('should not inject update-details twice if called multiple times', () => {
      controller.ensureUpdateDetailsPage()
      controller.ensureUpdateDetailsPage()
      const count = mockModel.pages.filter((p) => p.path === '/update-details').length
      expect(count).toBe(1)
    })

    it('should register detailsNotConfirmed condition in model.conditions', () => {
      controller.ensureUpdateDetailsPage()
      expect(mockModel.conditions['detailsNotConfirmed']).toBeDefined()
      expect(mockModel.conditions['detailsNotConfirmed'].fn({ detailsConfirmed: false })).toBe(true)
      expect(mockModel.conditions['detailsNotConfirmed'].fn({ detailsConfirmed: true })).toBe(false)
    })

    it('should set condition on the injected update-details controller', () => {
      controller.ensureUpdateDetailsPage()
      const updateDetailsController = mockModel.pages.find((p) => p.path === '/update-details')
      expect(updateDetailsController.condition).toBe(mockModel.conditions['detailsNotConfirmed'])
    })

    it('should set condition name on the injected update-details page def', () => {
      controller.ensureUpdateDetailsPage()
      const updateDetailsPageDef = mockModel.def.pages.find((p) => p.path === '/update-details')
      expect(updateDetailsPageDef.condition).toBe('detailsNotConfirmed')
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
})

describe('UpdateDetailsPageController', () => {
  let updateController
  let mockModel
  let mockRequest
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()

    mockModel = {
      basePath: '/test-form',
      lists: [],
      pages: [],
      pageMap: new Map(),
      def: {
        pages: [],
        metadata: {}
      }
    }

    const updateDetailsPageDef = {
      title: 'Update your details',
      path: '/update-details',
      controller: 'SomeTerminalController',
      components: []
    }

    updateController = new UpdateDetailsPageController(mockModel, updateDetailsPageDef)

    mockRequest = {
      params: { slug: 'test-form' },
      auth: {
        credentials: {
          currentRelationshipId: 'REL123'
        }
      }
    }

    mockH = {
      view: vi.fn().mockReturnValue('mocked-view'),
      redirect: vi.fn().mockReturnValue('mocked-redirect')
    }
  })

  describe('makeGetRouteHandler', () => {
    it('should render incorrect-details view with form metadata', async () => {
      vi.mocked(findFormBySlug).mockResolvedValue({
        title: 'Test Form',
        metadata: {
          incorrectDetailsContent: { heading: 'Update needed' },
          supportEmail: 'support@example.com'
        }
      })

      const handler = updateController.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(findFormBySlug).toHaveBeenCalledWith('test-form')
      expect(mockH.view).toHaveBeenCalledWith('incorrect-details', {
        pageTitle: 'Update your details',
        serviceName: 'Test Form',
        serviceUrl: '/test-form',
        backLink: { href: '/test-form/check-details' },
        incorrectDetailsContent: { heading: 'Update needed' },
        supportEmail: 'support@example.com'
      })
      expect(result).toBe('mocked-view')
    })

    it('should pass null for missing metadata fields', async () => {
      vi.mocked(findFormBySlug).mockResolvedValue({ title: 'Test Form', metadata: {} })

      const handler = updateController.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'incorrect-details',
        expect.objectContaining({
          incorrectDetailsContent: null,
          supportEmail: null
        })
      )
    })
  })
})
