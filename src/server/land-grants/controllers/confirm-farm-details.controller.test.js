import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { fetchBusinessAndCustomerInformation } from '../../common/services/consolidated-view/consolidated-view.service.js'
import ConfirmFarmDetailsController from './confirm-farm-details.controller.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
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
    landlinePhoneNumber: '01234567890',
    mobilePhoneNumber: '07123456789',
    email: 'test@farm.com'
  },
  customer: {
    name: { title: 'Mrs', first: 'Sarah', middle: 'A', last: 'Farmer' }
  }
}

describe('ConfirmFarmDetailsController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    controller = new ConfirmFarmDetailsController()
    setupControllerMocks(controller)
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
    config.get.mockReturnValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('POST route handler', () => {
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
      expect(mockH.view).toHaveBeenCalledWith(
        'confirm-farm-details',
        expect.objectContaining({
          details: expect.any(Object)
        })
      )
      expect(result).toBe('mocked-view')
    })

    it('should handle errors and render error view', async () => {
      const error = new Error('Service unavailable')
      fetchBusinessAndCustomerInformation.mockRejectedValue(error)

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'confirm-farm-details',
        expect.objectContaining({
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
      )
      expect(result).toBe('mocked-view')
    })
  })

  describe('buildDetailsForView', () => {
    describe('when enableDetailedFarmDetails is false (legacy view)', () => {
      beforeEach(() => {
        config.get.mockReturnValue(false)
      })

      it('should return a flat rows array', async () => {
        const result = await controller.buildDetailsForView(mockRequest)

        expect(config.get).toHaveBeenCalledWith('landGrants.enableDetailedFarmDetails')
        expect(result).toEqual({
          rows: expect.any(Array)
        })
      })

      it('should build rows with all available data', async () => {
        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.rows).toEqual([
          {
            key: { text: 'Name' },
            value: { text: 'Sarah A Farmer' }
          },
          {
            key: { text: 'Business name' },
            value: { text: 'Test Farm Business' }
          },
          {
            key: { text: 'Address' },
            value: { html: 'Line 1<br/>Line 2<br/>Test City<br/>TE1 1ST' }
          },
          {
            key: { text: 'SBI number' },
            value: { text: 'SBI123456' }
          },
          {
            key: { text: 'Contact details' },
            value: { html: 'formatted-01234567890<br/>formatted-07123456789<br/>test@farm.com' }
          }
        ])
      })

      it('should handle missing optional data', async () => {
        fetchBusinessAndCustomerInformation.mockResolvedValue({
          business: {},
          customer: {}
        })

        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.rows).toEqual([
          {
            key: { text: 'SBI number' },
            value: { text: 'SBI123456' }
          }
        ])
      })

      it('should handle missing auth credentials', async () => {
        const result = await controller.buildDetailsForView({})

        const sbiRow = result.rows.find((row) => row.key.text === 'SBI number')
        expect(sbiRow.value.text).toBeUndefined()
      })

      it('should handle missing customer name', async () => {
        fetchBusinessAndCustomerInformation.mockResolvedValue({
          ...mockData,
          customer: {}
        })

        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.rows.find((row) => row.key.text === 'Name')).toBeUndefined()
      })

      it('should handle missing business name', async () => {
        fetchBusinessAndCustomerInformation.mockResolvedValue({
          ...mockData,
          business: { ...mockData.business, name: undefined }
        })

        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.rows.find((row) => row.key.text === 'Business name')).toBeUndefined()
      })

      it('should handle missing business address', async () => {
        fetchBusinessAndCustomerInformation.mockResolvedValue({
          ...mockData,
          business: { ...mockData.business, address: undefined }
        })

        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.rows.find((row) => row.key.text === 'Address')).toBeUndefined()
      })

      it('should handle missing phone and email', async () => {
        fetchBusinessAndCustomerInformation.mockResolvedValue({
          ...mockData,
          business: {
            ...mockData.business,
            landlinePhoneNumber: undefined,
            mobilePhoneNumber: undefined,
            email: undefined
          }
        })

        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.rows.find((row) => row.key.text === 'Contact details')).toBeUndefined()
      })
    })

    describe('when enableDetailedFarmDetails is true (detailed view)', () => {
      beforeEach(() => {
        config.get.mockReturnValue(true)
      })

      it('should return person, business, and contact sections', async () => {
        const result = await controller.buildDetailsForView(mockRequest)

        expect(config.get).toHaveBeenCalledWith('landGrants.enableDetailedFarmDetails')
        expect(result).toHaveProperty('person')
        expect(result).toHaveProperty('business')
        expect(result).toHaveProperty('contact')
        expect(result).not.toHaveProperty('rows')
      })

      it('should build person rows from customer name', async () => {
        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.person).toEqual({
          rows: [
            { key: { text: 'Title' }, value: { text: 'Mrs' } },
            { key: { text: 'First name' }, value: { text: 'Sarah' } },
            { key: { text: 'Middle name' }, value: { text: 'A' } },
            { key: { text: 'Last name' }, value: { text: 'Farmer' } }
          ]
        })
      })

      it('should build business rows with address and SBI, hiding optional empty address lines', async () => {
        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.business).toEqual({
          rows: [
            { key: { text: 'Business name' }, value: { text: ' Farm 1' } },
            { key: { text: 'Address 1' }, value: { text: 'Line 1' } },
            { key: { text: 'Address 2' }, value: { text: 'Line 2' } },
            { key: { text: 'City' }, value: { text: 'Test City' } },
            { key: { text: 'Postcode' }, value: { text: 'TE1 1ST' } },
            { key: { text: 'SBI number' }, value: { text: 'SBI123456' } }
          ]
        })
      })

      it('should build contact rows with formatted phone numbers', async () => {
        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.contact).toEqual({
          rows: [
            { key: { text: 'Landline number' }, value: { text: 'formatted-01234567890' } },
            { key: { text: 'Mobile number' }, value: { text: 'formatted-07123456789' } },
            { key: { text: 'Email address' }, value: { text: 'test@farm.com' } }
          ]
        })
      })

      it('should show mandatory person fields as blank and hide optional middle name when customer name is missing', async () => {
        fetchBusinessAndCustomerInformation.mockResolvedValue({
          ...mockData,
          customer: {}
        })

        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.person).toEqual({
          rows: [
            { key: { text: 'Title' }, value: { text: undefined } },
            { key: { text: 'First name' }, value: { text: undefined } },
            { key: { text: 'Last name' }, value: { text: undefined } }
          ]
        })
      })

      it('should show mandatory business fields as blank and hide optional when business is missing', async () => {
        fetchBusinessAndCustomerInformation.mockResolvedValue({
          ...mockData,
          business: undefined
        })

        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.business).toEqual({
          rows: [
            { key: { text: 'Business name' }, value: { text: ' Farm 1' } },
            { key: { text: 'Address 1' }, value: { text: undefined } },
            { key: { text: 'City' }, value: { text: undefined } },
            { key: { text: 'Postcode' }, value: { text: undefined } },
            { key: { text: 'SBI number' }, value: { text: 'SBI123456' } }
          ]
        })
      })

      it('should return empty contact rows when business is missing', async () => {
        fetchBusinessAndCustomerInformation.mockResolvedValue({
          ...mockData,
          business: undefined
        })

        const result = await controller.buildDetailsForView(mockRequest)

        expect(result.contact).toEqual({ rows: [] })
      })
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
