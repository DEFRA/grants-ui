import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { fetchBusinessAndCustomerInformation } from '../../common/services/consolidated-view/consolidated-view.service.js'
import ConfirmFarmDetailsController from './confirm-farm-details.controller.js'
vi.mock('~/src/config/config.js')

vi.mock('../../common/services/consolidated-view/consolidated-view.service.js')

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
    fetchBusinessAndCustomerInformation.mockResolvedValue(mockData)
    config.get.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('POST route handler', () => {
    test('should not update state and proceed if no sbi', async () => {
      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchBusinessAndCustomerInformation).toHaveBeenCalled()
      expect(controller.setState).toHaveBeenCalled()

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

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    it('should not fetch business details if there is no sbi', async () => {
      const handler = controller.makePostRouteHandler()
      const result = await handler({ ...mockRequest, auth: { credentials: { sbi: undefined } } }, mockContext, mockH)

      expect(fetchBusinessAndCustomerInformation).not.toHaveBeenCalled()
      expect(controller.setState).not.toHaveBeenCalled()

      expect(controller.proceed).toHaveBeenCalled()
      expect(result).toBe('redirected')
    })
  })

  describe('makeGetRouteHandler', () => {
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
          phone: '07123456789',
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

    it('should handle missing optional data', async () => {
      const mockDataWithMissing = {
        business: {},
        customer: {}
      }

      fetchBusinessAndCustomerInformation.mockResolvedValue(mockDataWithMissing)

      const result = await controller.buildFarmDetails(mockRequest)

      expect(result.rows).toEqual([
        {
          key: { text: 'SBI number' },
          value: { text: 'SBI123456' }
        }
      ])
    })

    it('should handle missing auth credentials', async () => {
      const requestWithoutAuth = {}

      fetchBusinessAndCustomerInformation.mockResolvedValue(mockData)

      const result = await controller.buildFarmDetails(requestWithoutAuth)

      expect(result.rows).toHaveLength(5)
      const sbiRow = result.rows.find((row) => row.key.text === 'SBI number')
      expect(sbiRow).toBeDefined()
      expect(sbiRow.value.text).toBeUndefined()
    })

    it('should handle missing credentials in auth', async () => {
      const requestWithoutCredentials = {
        auth: {} // No credentials
      }

      fetchBusinessAndCustomerInformation.mockResolvedValue(mockData)

      const result = await controller.buildFarmDetails(requestWithoutCredentials)

      expect(result.rows).toHaveLength(5)
      const sbiRow = result.rows.find((row) => row.key.text === 'SBI number')
      expect(sbiRow).toBeDefined()
      expect(sbiRow.value.text).toBeUndefined()
    })

    it('should handle missing sbi in credentials', async () => {
      const requestWithoutSbi = {
        auth: {
          credentials: {} // No sbi
        }
      }

      fetchBusinessAndCustomerInformation.mockResolvedValue(mockData)

      const result = await controller.buildFarmDetails(requestWithoutSbi)

      expect(result.rows).toHaveLength(5)
      const sbiRow = result.rows.find((row) => row.key.text === 'SBI number')
      expect(sbiRow).toBeDefined()
      expect(sbiRow.value.text).toBeUndefined()
    })

    it('should handle missing customer name', async () => {
      const mockDataWithoutCustomerName = {
        ...mockData,
        customer: {} // No name
      }

      fetchBusinessAndCustomerInformation.mockResolvedValue(mockDataWithoutCustomerName)

      const result = await controller.buildFarmDetails(mockRequest)

      expect(result.rows.find((row) => row.key.text === 'Name')).toBeUndefined()
    })

    it('should handle missing business name', async () => {
      const mockDataWithoutBusinessName = {
        ...mockData,
        business: {
          ...mockData.business,
          name: undefined
        }
      }

      fetchBusinessAndCustomerInformation.mockResolvedValue(mockDataWithoutBusinessName)

      const result = await controller.buildFarmDetails(mockRequest)

      expect(result.rows.find((row) => row.key.text === 'Business name')).toBeUndefined()
    })

    it('should handle missing business address', async () => {
      const mockDataWithoutAddress = {
        ...mockData,
        business: {
          ...mockData.business,
          address: undefined
        }
      }

      fetchBusinessAndCustomerInformation.mockResolvedValue(mockDataWithoutAddress)

      const result = await controller.buildFarmDetails(mockRequest)

      expect(result.rows.find((row) => row.key.text === 'Address')).toBeUndefined()
    })

    it('should handle missing phone and email', async () => {
      const mockDataWithoutContactDetails = {
        ...mockData,
        business: {
          ...mockData.business,
          phone: undefined,
          email: undefined
        }
      }

      fetchBusinessAndCustomerInformation.mockResolvedValue(mockDataWithoutContactDetails)

      const result = await controller.buildFarmDetails(mockRequest)

      expect(result.rows.find((row) => row.key.text === 'Contact details')).toBeUndefined()
    })
  })

  describe('handleError', () => {
    it('should log error and return error view', () => {
      const error = new Error('Test error')
      const baseViewModel = { baseProperty: 'value' }

      const result = controller.handleError('sbi-123', error, baseViewModel, mockH)

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
