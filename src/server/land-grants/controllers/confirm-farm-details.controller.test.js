import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { fetchBusinessAndCustomerInformation } from '../../common/services/consolidated-view/consolidated-view.service.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import ConfirmFarmDetailsController from './confirm-farm-details.controller.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

vi.mock('~/src/config/config.js')
vi.mock('~/src/server/sbi/state.js', async () => {
  const { mockSbiState } = await import('~/src/__mocks__')
  return mockSbiState()
})
vi.mock('../../common/services/consolidated-view/consolidated-view.service.js')
vi.mock('~/src/server/common/helpers/logging/logger.js', async () => {
  const { mockLoggerFactoryWithCustomMethods } = await import('~/src/__mocks__')
  return mockLoggerFactoryWithCustomMethods({
    error: vi.fn()
  })
})

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    FORMS: {
      FORM_STARTED: 'LAND_GRANT_APPLICATION_STARTED'
    }
  }
}))

vi.mock('../../common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchBusinessAndCustomerInformation: vi.fn()
}))

vi.mock('~/src/server/land-grants/utils/format-phone.js', () => ({
  formatPhone: vi.fn((phone) => (phone ? `formatted-${phone}` : ''))
}))

const mockData = {
  business: {
    name: 'Test Farm Business',
    address: {
      line1: 'Line 1',
      line2: 'Line 2',
      city: 'Test City',
      postalCode: 'TE1 1ST'
    },
    phone: { mobile: '07123456789' },
    email: { address: 'test@farm.com' }
  },
  customer: {
    name: { first: 'Sarah', middle: 'A', last: 'Farmer' }
  }
}

describe('ConfirmFarmDetailsController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    controller = new ConfirmFarmDetailsController()
    controller.proceed = vi.fn().mockResolvedValue('redirected')
    controller.getNextPath = vi.fn().mockReturnValue('/next-path')
    controller.setState = vi.fn()
    mockRequest = {
      auth: {
        isAuthenticated: true,
        credentials: {
          currentRelationshipId: 'SBI123456',
          contactId: '1100014934',
          relationships: ['1101629797:SBI123456'],
          sbi: 'SBI123456',
          crn: '1100014934',
          name: 'John Doe',
          organisationId: 'SBI123456',
          organisationName: ' Farm 1',
          role: 'admin',
          sessionId: 'valid-session-id'
        }
      }
    }
    mockContext = {}
    mockH = {
      view: vi.fn().mockReturnValue('mocked-view')
    }
    sbiStore.get = vi.fn().mockReturnValue('SBI123456')
    fetchBusinessAndCustomerInformation.mockResolvedValue(mockData)
    config.get.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('POST route handler', () => {
    test('should not update state and proceed if no sbi', async () => {
      const handler = controller.makePostRouteHandler()
      mockRequest.auth.credentials.sbi = null
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchBusinessAndCustomerInformation).not.toHaveBeenCalled()
      expect(controller.setState).not.toHaveBeenCalled()
      expect(log).not.toHaveBeenCalled()

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    test('should update state with sbi and applicant details and proceed', async () => {
      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchBusinessAndCustomerInformation).toHaveBeenCalledWith(mockRequest)
      expect(controller.setState).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          applicant: {
            ...mockData
          }
        })
      )

      expect(log).toHaveBeenCalledWith(LogCodes.FORMS.FORM_STARTED, {
        formName: 'Farm payments',
        userCrn: '1100014934',
        userSbi: 'SBI123456'
      })

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })
  })

  describe('makeGetRouteHandler', () => {
    it('should return a function', () => {
      const handler = controller.makeGetRouteHandler()
      expect(typeof handler).toBe('function')
    })

    it('should handle successful data fetch and render view', async () => {
      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchBusinessAndCustomerInformation).toHaveBeenCalledWith(mockRequest)
      expect(mockH.view).toHaveBeenCalledWith('confirm-farm-details', {
        farmDetails: expect.objectContaining({
          rows: expect.any(Array)
        }),
        pageTitle: 'Default Title'
      })
      expect(result).toBe('mocked-view')
    })

    it('should handle errors and render error view', async () => {
      const error = new Error('Service unavailable')
      fetchBusinessAndCustomerInformation.mockRejectedValue(error)

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirm-farm-details', {
        error: {
          titleText: 'There is a problem',
          errorList: [
            {
              text: ConfirmFarmDetailsController.ERROR_MESSAGE,
              href: ''
            }
          ]
        },
        pageTitle: 'Default Title'
      })
      expect(result).toBe('mocked-view')
    })
  })

  describe('buildFarmDetails', () => {
    it('should build farm details with all available data', async () => {
      const mockData = {
        business: {
          name: 'Test Business',
          address: {
            line1: 'Line 1',
            line2: 'Line 2',
            city: 'City',
            postalCode: 'PC1 2CD'
          },
          phone: { mobile: '07123456789' },
          email: { address: 'test@example.com' }
        },
        customer: {
          name: { first: 'Sarah', last: 'Farmer' }
        }
      }

      fetchBusinessAndCustomerInformation.mockResolvedValue(mockData)

      const result = await controller.buildFarmDetails(mockRequest)

      expect(result).toEqual({
        rows: [
          {
            key: { text: 'Name' },
            value: { text: 'Sarah Farmer' }
          },
          {
            key: { text: 'Business name' },
            value: { text: 'Test Business' }
          },
          {
            key: { text: 'Address' },
            value: { html: 'Line 1<br/>Line 2<br/>City<br/>PC1 2CD' }
          },
          {
            key: { text: 'SBI number' },
            value: { text: 'SBI123456' }
          },
          {
            key: { text: 'Contact details' },
            value: { html: 'formatted-07123456789<br/>test@example.com' }
          }
        ]
      })
    })
  })

  describe('handleError', () => {
    it('should return error view', () => {
      const baseViewModel = { baseProperty: 'value' }

      const result = controller.handleError(baseViewModel, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirm-farm-details', {
        baseProperty: 'value',
        error: {
          titleText: 'There is a problem',
          errorList: [
            {
              text: ConfirmFarmDetailsController.ERROR_MESSAGE,
              href: ''
            }
          ]
        }
      })
      expect(result).toBe('mocked-view')
    })
  })

  describe('constants', () => {
    it('should have correct static constants', () => {
      expect(ConfirmFarmDetailsController.ERROR_MESSAGE).toBe(
        'Unable to find farm information, please try again later or contact the Rural Payments Agency.'
      )
    })
  })
})
