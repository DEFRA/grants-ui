import { describe, test, expect, beforeEach, vi } from 'vitest'
import PrintSubmittedApplicationController from './print-submitted-application.controller.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { forbidden } from '@hapi/boom'
import {
  buildPrintViewModel,
  enrichDefinitionWithListItems,
  processConfigurablePrintContent
} from '../common/helpers/print-application-service/print-application-service.js'

import { createBusinessRows, createContactRows, createPersonRows } from '../common/helpers/create-rows.js'

import { getPrintSubmittedApplicationPath } from '../common/helpers/form-slug-helper.js'
import { ApplicationStatus } from '../common/constants/application-status.js'

vi.mock('../common/helpers/forms-cache/forms-cache.js')
vi.mock('../common/helpers/print-application-service/print-application-service.js')
vi.mock('../common/helpers/create-rows.js')
vi.mock('../common/helpers/form-slug-helper.js')
vi.mock('../common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    PRINT_APPLICATION: {
      ERROR: 'PRINT_APPLICATION.ERROR'
    }
  }
}))

const mockDefinition = {
  metadata: {}
}

const mockModel = {
  def: mockDefinition
}

const mockState = {
  applicationStatus: 'SUBMITTED',
  $$__referenceNumber: 'REF-123',
  submittedAt: '2025-01-15T10:00:00.000Z',
  additionalAnswers: {
    applicant: {
      business: {
        name: 'Test Business'
      },
      customer: {
        name: {
          first: 'Test',
          last: 'User'
        }
      }
    }
  }
}

describe('PrintSubmittedApplicationController', () => {
  let controller
  let request
  let h

  beforeEach(() => {
    vi.clearAllMocks()

    controller = new PrintSubmittedApplicationController(mockModel, {})

    request = {
      params: {
        slug: 'test-form'
      },
      auth: {
        credentials: {
          sbi: '123456789'
        }
      },
      server: {}
    }

    h = {
      view: vi.fn(),
      response: vi.fn(() => ({
        code: vi.fn()
      }))
    }

    buildPrintViewModel.mockReturnValue({
      test: 'viewModel'
    })

    processConfigurablePrintContent.mockReturnValue(undefined)

    getFormsCacheService.mockReturnValue({
      getState: vi.fn().mockResolvedValue(mockState)
    })
  })

  describe('getStatusPath', () => {
    test('returns print submitted application path', () => {
      getPrintSubmittedApplicationPath.mockReturnValue('/test-form/print-submitted-application')

      const result = controller.getStatusPath(request, {})

      expect(result).toBe('/test-form/print-submitted-application')

      expect(getPrintSubmittedApplicationPath).toHaveBeenCalledWith(request, {}, 'PrintSubmittedApplicationController')
    })
  })

  describe('makeGetRouteHandler', () => {
    test('renders print application page', async () => {
      const handler = controller.makeGetRouteHandler()

      await handler(request, {}, h)

      expect(buildPrintViewModel).toHaveBeenCalled()

      expect(h.view).toHaveBeenCalledWith('print-submitted-application', { test: 'viewModel' })
    })

    test('returns 403 when application status is not SUBMITTED', async () => {
      getFormsCacheService.mockReturnValue({
        getState: vi.fn().mockResolvedValue({ applicationStatus: ApplicationStatus.REOPENED })
      })

      const code = vi.fn()

      h.response.mockReturnValue({
        code
      })

      const handler = controller.makeGetRouteHandler()

      await handler(request, {}, h)

      expect(h.response).toHaveBeenCalledWith('Application not submitted')

      expect(code).toHaveBeenCalledWith(403)
    })
  })

  describe('resolveApplicantDetailsSections', () => {
    test('returns null when feature disabled', () => {
      const result = controller.resolveApplicantDetailsSections(request, mockState, { metadata: {} })

      expect(result).toBeNull()
    })

    test('returns applicant sections when enabled', () => {
      const personRows = { rows: [] }
      const businessRows = { rows: [] }
      const contactRows = { rows: [] }

      createPersonRows.mockReturnValue(personRows)
      createBusinessRows.mockReturnValue(businessRows)
      createContactRows.mockReturnValue(contactRows)

      const result = controller.resolveApplicantDetailsSections(request, mockState, {
        metadata: {
          printPage: {
            showApplicantDetails: true
          }
        }
      })

      expect(result).toEqual({
        person: personRows,
        business: businessRows,
        contact: contactRows
      })
    })
  })

  describe('buildPrintResponse', () => {
    test('builds print view model and renders view', async () => {
      await controller.buildPrintResponse(
        {
          form: mockDefinition,
          state: mockState,
          slug: 'test-form'
        },
        request,
        h
      )

      expect(enrichDefinitionWithListItems).toHaveBeenCalled()

      expect(processConfigurablePrintContent).toHaveBeenCalled()

      expect(buildPrintViewModel).toHaveBeenCalled()

      expect(h.view).toHaveBeenCalledWith('print-submitted-application', { test: 'viewModel' })
    })
  })

  describe('error handling', () => {
    test('returns 500 and logs unexpected errors', async () => {
      const error = new Error('Something exploded')

      getFormsCacheService.mockReturnValue({
        getState: vi.fn().mockRejectedValue(error)
      })

      const code = vi.fn()

      h.response.mockReturnValue({
        code
      })

      const handler = controller.makeGetRouteHandler()

      await handler(request, {}, h)

      expect(log).toHaveBeenCalledWith(
        LogCodes.PRINT_APPLICATION.ERROR,
        {
          userId: 'unknown',
          errorMessage: 'Config-driven confirmation route error for slug: test-form. Something exploded'
        },
        request
      )

      expect(h.response).toHaveBeenCalledWith('Server error')
      expect(code).toHaveBeenCalledWith(500)
    })

    test('uses unknown userId when auth credentials are missing', async () => {
      request.auth = {}

      getFormsCacheService.mockReturnValue({
        getState: vi.fn().mockRejectedValue(new Error('Boom'))
      })

      const handler = controller.makeGetRouteHandler()

      await handler(request, {}, h)

      expect(log).toHaveBeenCalledWith(
        LogCodes.PRINT_APPLICATION.ERROR,
        expect.objectContaining({
          userId: 'unknown'
        }),
        request
      )
    })

    test('rethrows Boom errors', async () => {
      const boomError = forbidden('Insufficient permissions')

      vi.spyOn(controller, 'buildPrintResponse').mockRejectedValue(boomError)

      const handler = controller.makeGetRouteHandler()

      try {
        await handler(request, {}, h)
        throw new Error('Expected handler to throw')
      } catch (err) {
        expect(err).toBe(boomError)
      }
    })
  })

  describe('handleError', () => {
    test('returns 500 response for non-boom errors', () => {
      const code = vi.fn()

      h.response.mockReturnValue({
        code
      })

      controller.handleError(new Error('Test error'), request, h)

      expect(h.response).toHaveBeenCalledWith('Server error')
      expect(code).toHaveBeenCalledWith(500)
    })

    test('rethrows boom errors', () => {
      const boomError = forbidden('Forbidden')

      expect(() => controller.handleError(boomError, request, h)).toThrow('Forbidden')
    })
  })
})
