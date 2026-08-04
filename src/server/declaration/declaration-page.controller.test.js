import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import * as formSlugHelper from '~/src/server/common/helpers/form-slug-helper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import {
  resolveGasConfigVersion,
  transformStateObjectToGasApplication
} from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import DeclarationPageController, { UNCONFIGURED_DEFAULTS } from './declaration-page.controller.js'
import { vi } from 'vitest'
import { mockHapiRequest } from '~/src/__mocks__'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { handleGasApiError } from '~/src/server/common/helpers/gas-error-messages.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { getTaskPageBackLink } from '~/src/server/task-list/task-list.helper.js'

vi.mock('~/src/server/common/helpers/gas-error-messages.js')
vi.mock('../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

const mockCacheService = {
  getState: vi.fn().mockReturnValue({
    $$__referenceNumber: 'REF123'
  }),
  setState: vi.fn()
}
vi.mock('~/src/server/common/helpers/form-slug-helper.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => mockCacheService
}))
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () => {
  return {
    SummaryPageController: class {
      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
        this.collection = { getViewErrors: vi.fn((errors) => errors) }
      }

      getSummaryViewModel(request, context) {
        return {
          serviceUrl: '/service',
          page: {
            title: 'Summary'
          }
        }
      }
    }
  }
})
vi.mock('~/src/server/common/services/grant-application/grant-application.service.js')
vi.mock('~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js')
vi.mock('~/src/server/task-list/task-list.helper.js', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    getTaskPageBackLink: vi.fn(),
    getTaskListPath: vi.fn().mockReturnValue('/task-list')
  }
})
vi.mock('~/src/server/common/helpers/permissions/guards/require-cs-submit-permission.js', () => ({
  requireCsSubmitPermission: vi.fn((request, h) => h.continue)
}))

describe('DeclarationPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH
  let mockModel
  let mockPageDef
  let parentGetHandler

  beforeEach(() => {
    mockModel = {
      def: {
        metadata: {
          version: '1.1.1',
          submission: {
            grantCode: 'example-grant-with-auth'
          }
        }
      },
      componentDefMap: {},
      listDefIdMap: {},
      getSection: (id) => ({ id: '79d03fa4-bf5b-4a78-8f6e-eb94bab7a5c4', title: 'Example Section' })
    }
    mockPageDef = {
      section: '79d03fa4-bf5b-4a78-8f6e-eb94bab7a5c4'
    }

    // Mock the parent's GET handler
    parentGetHandler = vi.fn().mockImplementation(() => {
      return Promise.resolve('parent handler response')
    })
    SummaryPageController.prototype.makeGetRouteHandler = vi.fn().mockReturnValue(parentGetHandler)

    controller = new DeclarationPageController(mockModel, mockPageDef)

    mockRequest = mockHapiRequest({
      payload: {
        declaration: true
      },
      params: {
        slug: 'example-grant-with-auth'
      },
      path: '/example-grant-with-auth/declaration',
      server: {},
      app: { model: mockModel },
      auth: {
        credentials: {
          sbi: 'sbi123',
          crn: '1234567890'
        }
      }
    })

    mockContext = {
      relevantState: {
        referenceNumber: 'REF123',
        field1: 'value1'
      },
      referenceNumber: 'REF123',
      state: {
        previousReferenceNumber: 'REF345'
      },
      payload: {
        declaration: true
      }
    }

    mockH = {
      redirect: vi.fn().mockReturnValue('redirected'),
      view: vi.fn().mockReturnValue('rendered view')
    }

    // Mock the form-slug-helper functions
    formSlugHelper.storeSlugInContext.mockImplementation(() => null)
    formSlugHelper.getConfirmationPath.mockImplementation(() => '/example-grant-with-auth/confirmation')
  })

  const mockGasSubmission = () =>
    beforeEach(() => {
      transformStateObjectToGasApplication.mockReturnValue({
        transformedApp: true,
        metadata: {
          submittedAt: '2025-01-01T00:00:00.000Z'
        }
      })
      resolveGasConfigVersion.mockReturnValue('1.1.1')
      submitGrantApplication.mockResolvedValue({
        status: statusCodes.noContent
      })
    })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    test('should set viewName to declaration-page.html', () => {
      expect(controller.viewName).toBe('declaration-page.html')
    })

    test('should override viewName when pageDef.view is provided', () => {
      const pageDefWithView = { ...mockPageDef, view: 'custom-view.html' }
      const controllerWithView = new DeclarationPageController(mockModel, pageDefWithView)
      expect(controllerWithView.viewName).toBe('custom-view.html')
    })

    test('should resolve section when pageDef has section property', () => {
      const getSectionSpy = vi.spyOn(mockModel, 'getSection')
      const controllerWithSection = new DeclarationPageController(mockModel, mockPageDef)
      expect(controllerWithSection.section).toEqual({
        id: '79d03fa4-bf5b-4a78-8f6e-eb94bab7a5c4',
        title: 'Example Section'
      })
      expect(getSectionSpy).toHaveBeenCalledWith('79d03fa4-bf5b-4a78-8f6e-eb94bab7a5c4')
    })

    test('should not resolve section when pageDef has no section property', () => {
      const pageDefWithoutSection = {}
      const controllerWithoutSection = new DeclarationPageController(mockModel, pageDefWithoutSection)
      expect(controllerWithoutSection.section).toBeUndefined()
    })
  })

  describe('getSummaryViewModel', () => {
    test('should include backLink when getTaskPageBackLink returns a value', () => {
      getTaskPageBackLink.mockReturnValue({ href: '/task-list', text: 'Back to task list' })

      const result = controller.getSummaryViewModel(mockRequest, mockContext)

      expect(getTaskPageBackLink).toHaveBeenCalledWith(
        {
          serviceUrl: '/service',
          page: {
            title: 'Summary'
          }
        },
        mockPageDef
      )
      expect(result.backLink).toEqual({ href: '/task-list', text: 'Back to task list' })
    })

    test.each([null, undefined])('should not include backLink when getTaskPageBackLink returns %s', (returnValue) => {
      getTaskPageBackLink.mockReturnValue(returnValue)
      const result = controller.getSummaryViewModel(mockRequest, mockContext)
      expect(result.backLink).toBeUndefined()
    })

    test('should fall back to the built-in copy when the page has no config block', () => {
      const result = controller.getSummaryViewModel(mockRequest, mockContext)

      expect(result.declarationContent).toEqual(UNCONFIGURED_DEFAULTS)
    })

    test('should fall back to the built-in copy when the form has no metadata', () => {
      const controllerWithoutMetadata = new DeclarationPageController({ ...mockModel, def: {} }, mockPageDef)

      const result = controllerWithoutMetadata.getSummaryViewModel(mockRequest, mockContext)

      expect(result.declarationContent).toEqual(UNCONFIGURED_DEFAULTS)
    })

    const declarationContentFor = (pageConfig) => {
      mockModel.def.metadata.pageConfig = pageConfig
      const configuredController = new DeclarationPageController(mockModel, { ...mockPageDef, path: '/declaration' })

      return configuredController.getSummaryViewModel(mockRequest, mockContext).declarationContent
    }

    const fullConfig = {
      submitButtonText: 'Confirm and submit',
      showSupportDetails: true,
      hiddenFields: { guidanceRead: 'true' }
    }

    test.each([
      ['the config block is empty', { '/declaration': {} }, { submitButtonText: 'Confirm and send' }],
      ['a full config block is declared', { '/declaration': fullConfig }, fullConfig],
      [
        'a config opts out of the built-in copy',
        { '/declaration': { showSupportDetails: true } },
        { submitButtonText: 'Confirm and send', showSupportDetails: true }
      ],
      [
        'the config targets another page path',
        { '/some-other-page': { submitButtonText: 'Not this one' } },
        UNCONFIGURED_DEFAULTS
      ]
    ])('should resolve declarationContent when %s', (_description, pageConfig, expected) => {
      expect(declarationContentFor(pageConfig)).toEqual(expected)
    })

    test('should expose the support email from form metadata', () => {
      mockModel.def.metadata.supportEmail = 'ruralpayments@defra.gov.uk'
      const controllerWithEmail = new DeclarationPageController(mockModel, mockPageDef)

      const result = controllerWithEmail.getSummaryViewModel(mockRequest, mockContext)

      expect(result.supportEmail).toBe('ruralpayments@defra.gov.uk')
    })

    test('should set sectionTitle to empty string when section has hideTitle set to true', () => {
      mockModel.getSection = vi.fn().mockReturnValue({
        id: '79d03fa4-bf5b-4a78-8f6e-eb94bab7a5c4',
        title: 'Example Section',
        hideTitle: true
      })
      const controllerWithHiddenTitle = new DeclarationPageController(mockModel, mockPageDef)

      const result = controllerWithHiddenTitle.getSummaryViewModel(mockRequest, mockContext)

      expect(result.sectionTitle).toBe('')
    })

    test('should set sectionTitle to undefined when section is undefined', () => {
      const pageDefWithoutSection = {}
      const controllerWithoutSection = new DeclarationPageController(mockModel, pageDefWithoutSection)

      const result = controllerWithoutSection.getSummaryViewModel(mockRequest, mockContext)

      expect(result.sectionTitle).toBeUndefined()
    })

    test('should preserve all parent view model properties', () => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValueOnce({
        serviceUrl: '/service',
        page: { title: 'Summary' },
        otherProperty: 'value',
        anotherProperty: 123
      })

      const result = controller.getSummaryViewModel(mockRequest, mockContext)

      expect(result.serviceUrl).toBe('/service')
      expect(result.page.title).toBe('Summary')
      expect(result.otherProperty).toBe('value')
      expect(result.anotherProperty).toBe(123)
      expect(result.sectionTitle).toBe('Example Section')
    })
  })

  describe('getStatusPath', () => {
    test('should delegate to getConfirmationPath and return its result', () => {
      formSlugHelper.getConfirmationPath.mockReturnValueOnce('/test-slug/confirmation')

      const result = controller.getStatusPath(mockRequest, mockContext)

      expect(formSlugHelper.getConfirmationPath).toHaveBeenCalledWith(mockRequest, mockContext, 'DeclarationController')
      expect(result).toBe('/test-slug/confirmation')
    })
  })

  describe('makeGetRouteHandler', () => {
    test('should store the slug in context, then delegate to the parent handler', async () => {
      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalledWith(mockRequest, mockContext, 'DeclarationController')
      expect(parentGetHandler).toHaveBeenCalledWith(mockRequest, mockContext, mockH)
      expect(result).toBe('parent handler response')
    })

    test('should handle errors from parent handler', async () => {
      const error = new Error('Parent handler error')
      parentGetHandler.mockRejectedValueOnce(error)

      const handler = controller.makeGetRouteHandler()
      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(error)

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalled()
    })
  })

  describe('makePostRouteHandler', () => {
    mockGasSubmission()

    /** @param {string} errorMessage */
    const expectSubmissionFailureLogged = (errorMessage) =>
      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_FAILURE,
        expect.objectContaining({
          grantType: 'example-grant-with-auth',
          referenceNumber: 'REF123',
          sbi: 'sbi123',
          crn: '1234567890',
          errorMessage
        }),
        mockRequest
      )

    test('should submit form and redirect on success', async () => {
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalledWith(mockRequest, mockContext, 'DeclarationController')

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        {
          clientRef: 'ref123',
          previousClientRef: 'ref345',
          sbi: 'sbi123',
          frn: 'undefined',
          crn: '1234567890'
        },
        { referenceNumber: 'REF123', field1: 'value1', declaration: true },
        expect.any(Function),
        '1.1.1'
      )
      expect(resolveGasConfigVersion).toHaveBeenCalledWith(mockRequest)

      expect(submitGrantApplication).toHaveBeenCalledWith(
        'example-grant-with-auth',
        {
          transformedApp: true,
          metadata: {
            submittedAt: '2025-01-01T00:00:00.000Z'
          }
        },
        mockRequest
      )
      expect(mockH.redirect).toHaveBeenCalledWith('/example-grant-with-auth/confirmation')
    })

    test('should re-render with errors and not submit when a page component fails validation', async () => {
      const errors = [{ href: '#agree', text: 'Select to confirm you agree to the declaration' }]
      const handler = controller.makePostRouteHandler()

      const result = await handler(mockRequest, { ...mockContext, errors }, mockH)

      expect(controller.collection.getViewErrors).toHaveBeenCalledWith(errors)
      expect(submitGrantApplication).not.toHaveBeenCalled()
      expect(mockH.redirect).not.toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(
        'declaration-page.html',
        expect.objectContaining({ serviceUrl: '/service', errors })
      )
      expect(result).toBe('rendered view')
    })

    test('should submit when the context errors belong to other pages', async () => {
      controller.collection.getViewErrors.mockReturnValue([])
      const handler = controller.makePostRouteHandler()

      await handler(mockRequest, { ...mockContext, errors: [{ href: '#other', text: 'Enter a value' }] }, mockH)

      expect(submitGrantApplication).toHaveBeenCalled()
      expect(mockH.redirect).toHaveBeenCalledWith('/example-grant-with-auth/confirmation')
    })

    test('should not include previousClientRef when previousReferenceNumber is absent', async () => {
      const handler = controller.makePostRouteHandler()

      const contextWithoutPreviousRef = {
        ...mockContext,
        state: {}
      }

      await handler(mockRequest, contextWithoutPreviousRef, mockH)

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        {
          clientRef: 'ref123',
          sbi: 'sbi123',
          frn: 'undefined',
          crn: '1234567890'
        },
        { referenceNumber: 'REF123', field1: 'value1', declaration: true },
        expect.any(Function),
        '1.1.1'
      )
    })

    test('should use the grasslands answer transformer for grasslands submissions', async () => {
      const handler = controller.makePostRouteHandler()
      const grasslandsRequest = {
        ...mockRequest,
        params: { slug: 'grasslands' },
        path: '/grasslands/declaration'
      }
      const landParcels = {
        'SD6364-6615': {
          size: {
            unitFullName: 'hectares',
            unit: 'ha',
            value: 24.7964
          },
          actionsObj: {
            UPL1: {
              description: 'Moderate livestock grazing on moorland: UPL1',
              version: '3.1.0',
              consents: [],
              value: 24.7964,
              unit: 'ha'
            }
          }
        }
      }
      const grasslandsContext = {
        ...mockContext,
        state: {
          ...mockContext.state,
          selectedParcelId: 'SD6364-6615',
          landParcels
        }
      }

      await handler(grasslandsRequest, grasslandsContext, mockH)

      const transformAnswers = transformStateObjectToGasApplication.mock.calls[0][2]
      const transformedAnswers = transformAnswers({ ...mockContext.relevantState, landParcels })

      expect(transformedAnswers).toMatchObject({
        parcels: [
          {
            parcelId: 'SD6364-6615',
            actions: [{ code: 'UPL1', value: 24.7964, unit: 'ha' }]
          }
        ]
      })
      expect(transformedAnswers).not.toHaveProperty('landParcels')
    })

    test('should use the pigs-might-fly answer transformer for pigs-might-fly submissions', async () => {
      const handler = controller.makePostRouteHandler()
      const pigsRequest = {
        ...mockRequest,
        params: { slug: 'pigs-might-fly' },
        path: '/pigs-might-fly/check-answers'
      }

      await handler(pigsRequest, mockContext, mockH)

      const transformAnswers = transformStateObjectToGasApplication.mock.calls[0][2]
      const transformedAnswers = transformAnswers({
        isPigFarmer: true,
        totalPigs: 42,
        whitePigsCount: 10
      })

      expect(transformedAnswers).toMatchObject({
        isPigFarmer: true,
        totalPigs: 42,
        whitePigsCount: 10
      })
    })

    test('should log debug information during processing', async () => {
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_PROCESSING,
        { controller: 'DeclarationController', path: mockRequest.path },
        mockRequest
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.APPLICATION_STATUS_UPDATED,
        { controller: 'DeclarationController', status: 'SUBMITTED' },
        mockRequest
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_REDIRECT,
        { controller: 'DeclarationController', redirectPath: '/example-grant-with-auth/confirmation' },
        mockRequest
      )
    })

    test('should log submission details when available', async () => {
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(log).toHaveBeenCalledWith(
        LogCodes.SUBMISSION.SUBMISSION_COMPLETED,
        {
          grantType: 'example-grant-with-auth',
          referenceNumber: 'REF123',
          numberOfFields: Object.keys(mockContext.relevantState).length,
          status: 'success'
        },
        mockRequest
      )
    })

    test('should handle submission errors', async () => {
      const error = new Error('Submission failed')
      submitGrantApplication.mockRejectedValue(error)

      const handler = controller.makePostRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(error)

      expectSubmissionFailureLogged('Submission failed')
    })

    test('should handle GrantApplicationServiceApiError and show custom error page', async () => {
      const gasError = new Error('GAS API Error')
      gasError.name = 'GrantApplicationServiceApiError'
      gasError.status = 429
      submitGrantApplication.mockRejectedValue(gasError)

      const mockErrorView = {
        code: vi.fn().mockReturnThis()
      }
      mockH.view = vi.fn().mockReturnValue(mockErrorView)
      handleGasApiError.mockReturnValue(mockErrorView)

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expectSubmissionFailureLogged('GAS API Error')
      expect(handleGasApiError).toHaveBeenCalledWith(mockH, mockContext, gasError)
      expect(result).toBe(mockErrorView)
    })

    test('should re-throw non-GAS errors', async () => {
      const error = new Error('Some other error')
      error.name = 'SomeOtherError'
      submitGrantApplication.mockRejectedValue(error)

      const handler = controller.makePostRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(error)

      expectSubmissionFailureLogged('Some other error')
      expect(handleGasApiError).not.toHaveBeenCalled()
    })
  })

  describe('buildApplicationData', () => {
    mockGasSubmission()

    test.each([
      ['the full chain is present', { applicant: { business: { reference: 'FRN123456' } } }, 'FRN123456'],
      ['additionalAnswers is undefined', undefined, 'undefined'],
      ['applicant is undefined', { applicant: undefined }, 'undefined'],
      ['business is undefined', { applicant: { business: undefined } }, 'undefined'],
      ['reference is undefined', { applicant: { business: { reference: undefined } } }, 'undefined']
    ])('should resolve frn when %s', (_description, additionalAnswers, frn) => {
      controller.buildApplicationData(mockRequest, {
        ...mockContext,
        state: { ...mockContext.state, additionalAnswers }
      })

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        expect.objectContaining({ frn }),
        expect.anything(),
        expect.any(Function),
        '1.1.1'
      )
    })

    test('should exclude the presentational consent checkbox from the GAS payload', () => {
      controller.buildApplicationData(mockRequest, {
        ...mockContext,
        payload: { action: 'send', consentOptional: 'CONSENT_OPTIONAL', guidanceRead: 'true' }
      })

      expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
        expect.anything(),
        { referenceNumber: 'REF123', field1: 'value1', guidanceRead: true },
        expect.any(Function),
        '1.1.1'
      )
    })

    test('uses woodland transformer when grant code is woodland', () => {
      const woodlandRequest = mockHapiRequest({
        ...mockRequest,
        params: { slug: 'woodland' }
      })

      controller.buildApplicationData(woodlandRequest, mockContext)

      const [, , transformFn] = transformStateObjectToGasApplication.mock.calls.at(-1)
      const result = transformFn({ referenceNumber: 'WMP-123', foo: 'bar' })
      expect(result).not.toHaveProperty('referenceNumber')
      expect(result).toHaveProperty('foo', 'bar')
    })

    test('uses passthrough transformer when grant code has no registered transformer', () => {
      controller.buildApplicationData(mockRequest, mockContext)

      const [, , transformFn] = transformStateObjectToGasApplication.mock.calls.at(-1)
      const input = { referenceNumber: 'REF123', foo: 'bar' }
      const result = transformFn(input)
      expect(result).toEqual(input)
    })
  })
})
