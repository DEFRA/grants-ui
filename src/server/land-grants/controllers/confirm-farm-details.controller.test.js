import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import { fetchBusinessAndCustomerInformation } from '../../common/services/consolidated-view/consolidated-view.service.js'
import ConfirmFarmDetailsController from './confirm-farm-details.controller.js'

jest.mock('~/src/server/sbi/state.js', () => ({
  sbiStore: {
    get: jest.fn()
  }
}))

jest.mock(
  '../../common/services/consolidated-view/consolidated-view.service.js'
)
jest.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn()
  }))
}))
jest.mock('~/src/config/nunjucks/filters/format-phone.js', () => ({
  formatPhone: jest.fn((phone) => (phone ? `formatted-${phone}` : ''))
}))

describe('ConfirmFarmDetailsController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH
  let mockLogger

  beforeEach(() => {
    controller = new ConfirmFarmDetailsController()
    mockRequest = {}
    mockContext = {}
    mockH = {
      view: jest.fn().mockReturnValue('mocked-view')
    }
    mockLogger = {
      error: jest.fn()
    }

    // Setup mocks
    sbiStore.get = jest.fn().mockReturnValue('SBI123456')
    createLogger.mockReturnValue(mockLogger)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('makeGetRouteHandler', () => {
    it('should handle successful data fetch from DAL and render view', async () => {
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

      fetchBusinessAndCustomerInformation.mockResolvedValue(mockData)

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchBusinessAndCustomerInformation).toHaveBeenCalledWith(
        'SBI123456',
        3646257965
      )
      expect(mockH.view).toHaveBeenCalledWith('confirm-farm-details', {
        farmDetails: expect.objectContaining({
          rows: expect.any(Array)
        })
      })
      expect(result).toBe('mocked-view')
    })

    it('should handle errors and render error view', async () => {
      const error = new Error('Service unavailable')
      fetchBusinessAndCustomerInformation.mockRejectedValue(error)

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirm-farm-details', {
        errorMessage: 'Unable to find farm information, please try again later.'
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

      const result = await controller.buildFarmDetails()

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

  describe('addCustomerNameRow', () => {
    it('should add name row when all name parts are present', () => {
      const rows = []
      const name = { first: 'Sarah', middle: 'A', last: 'Farmer' }

      controller.addCustomerNameRow(rows, name)

      expect(rows).toEqual([
        {
          key: { text: 'Name' },
          value: { text: 'Sarah A Farmer' }
        }
      ])
    })

    it('should add name row when only first and last names are present', () => {
      const rows = []
      const name = { first: 'Jane', last: 'Smith' }

      controller.addCustomerNameRow(rows, name)

      expect(rows).toEqual([
        {
          key: { text: 'Name' },
          value: { text: 'Jane Smith' }
        }
      ])
    })

    it('should not add row when name is missing', () => {
      const rows = []
      controller.addCustomerNameRow(rows, null)
      expect(rows).toEqual([])
    })

    it('should not add row when name parts are empty', () => {
      const rows = []
      const name = { first: '', middle: '', last: '' }
      controller.addCustomerNameRow(rows, name)
      expect(rows).toEqual([])
    })
  })

  describe('addBusinessNameRow', () => {
    it('should add business name row when name is present', () => {
      const rows = []
      controller.addBusinessNameRow(rows, 'Test Business Ltd')

      expect(rows).toEqual([
        {
          key: { text: 'Business name' },
          value: { text: 'Test Business Ltd' }
        }
      ])
    })

    it('should not add row when business name is missing', () => {
      const rows = []
      controller.addBusinessNameRow(rows, null)
      expect(rows).toEqual([])
    })
  })

  describe('addAddressRow', () => {
    it('should add address row with all fields', () => {
      const rows = []
      const address = {
        line1: 'Line 1',
        line2: 'Line 2',
        line3: 'Line 3',
        street: 'Main Street',
        city: 'Test City',
        postalCode: 'TE1 1ST'
      }

      controller.addAddressRow(rows, address)

      expect(rows).toEqual([
        {
          key: { text: 'Address' },
          value: {
            html: 'Line 1<br/>Line 2<br/>Line 3<br/>Main Street<br/>Test City<br/>TE1 1ST'
          }
        }
      ])
    })

    it('should trim commas and spaces from address parts', () => {
      const rows = []
      const address = {
        line1: '  , Line 1 , ',
        line2: ' Line 2,  ',
        line3: ',  Line 3  ,',
        city: 'Test City',
        postalCode: '  TE1 1ST  '
      }

      controller.addAddressRow(rows, address)

      expect(rows).toEqual([
        {
          key: { text: 'Address' },
          value: {
            html: 'Line 1<br/>Line 2<br/>Line 3<br/>Test City<br/>TE1 1ST'
          }
        }
      ])
    })

    it('should filter out empty address parts', () => {
      const rows = []
      const address = {
        line1: 'Line 1',
        line2: '',
        line3: '  ,  ',
        street: null,
        city: 'Test City',
        postalCode: 'TE1 1ST'
      }

      controller.addAddressRow(rows, address)

      expect(rows).toEqual([
        {
          key: { text: 'Address' },
          value: { html: 'Line 1<br/>Test City<br/>TE1 1ST' }
        }
      ])
    })

    it('should not add row when address is missing', () => {
      const rows = []
      controller.addAddressRow(rows, null)
      expect(rows).toEqual([])
    })

    it('should not add row when all address parts are empty', () => {
      const rows = []
      const address = {
        line1: '',
        line2: '  ',
        line3: ' , ',
        street: null,
        city: '',
        postalCode: '  ,  '
      }

      controller.addAddressRow(rows, address)
      expect(rows).toEqual([])
    })
  })

  describe('addSbiRow', () => {
    it('should always add SBI row', () => {
      const rows = []
      controller.addSbiRow(rows, 'SBI123456')

      expect(rows).toEqual([
        {
          key: { text: 'SBI number' },
          value: { text: 'SBI123456' }
        }
      ])
    })
  })

  describe('addContactDetailsRow', () => {
    it('should add contact details with both mobile and email', () => {
      const rows = []
      controller.addContactDetailsRow(rows, '07123456789', 'test@example.com')

      expect(rows).toEqual([
        {
          key: { text: 'Contact details' },
          value: { html: 'formatted-07123456789<br/>test@example.com' }
        }
      ])
    })

    it('should add contact details with only mobile', () => {
      const rows = []
      controller.addContactDetailsRow(rows, '07123456789', null)

      expect(rows).toEqual([
        {
          key: { text: 'Contact details' },
          value: { html: 'formatted-07123456789' }
        }
      ])
    })

    it('should add contact details with only email', () => {
      const rows = []
      controller.addContactDetailsRow(rows, null, 'test@example.com')

      expect(rows).toEqual([
        {
          key: { text: 'Contact details' },
          value: { html: 'test@example.com' }
        }
      ])
    })

    it('should not add row when both mobile and email are missing', () => {
      const rows = []
      controller.addContactDetailsRow(rows, null, null)
      expect(rows).toEqual([])
    })
  })

  describe('handleError', () => {
    it('should log error and return error view', () => {
      const error = new Error('Test error')
      const baseViewModel = { baseProperty: 'value' }

      const result = controller.handleError(error, baseViewModel, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirm-farm-details', {
        baseProperty: 'value',
        errorMessage: 'Unable to find farm information, please try again later.'
      })
      expect(result).toBe('mocked-view')
    })
  })
})
