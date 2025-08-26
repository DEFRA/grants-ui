import { sbiStore } from '~/src/server/sbi/state.js'
import { fetchBusinessAndCustomerInformation } from '../../common/services/consolidated-view/consolidated-view.service.js'
import ConfirmFarmDetailsController from './confirm-farm-details.controller.js'

jest.mock('~/src/server/sbi/state.js', () => ({
  sbiStore: {
    get: jest.fn()
  }
}))

jest.mock('../../common/services/consolidated-view/consolidated-view.service.js')
jest.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn()
  }))
}))
jest.mock('~/src/server/land-grants/utils/format-phone.js', () => ({
  formatPhone: jest.fn((phone) => (phone ? `formatted-${phone}` : ''))
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
    controller.proceed = jest.fn().mockResolvedValue('redirected')
    controller.getNextPath = jest.fn().mockReturnValue('/next-path')
    controller.setState = jest.fn()
    mockRequest = {}
    mockContext = {}
    mockH = {
      view: jest.fn().mockReturnValue('mocked-view')
    }
    sbiStore.get = jest.fn().mockReturnValue('SBI123456')
    fetchBusinessAndCustomerInformation.mockResolvedValue(mockData)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('makeGetRouteHandler', () => {
    it('should return a function', () => {
      const handler = controller.makeGetRouteHandler()
      expect(typeof handler).toBe('function')
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
        }
      })
      expect(result).toBe('mocked-view')
    })
  })

  describe('createCustomerNameRow', () => {
    it('should create name row when all name parts are present', () => {
      const name = { first: 'Sarah', middle: 'A', last: 'Farmer' }

      const result = controller.createCustomerNameRow(name)

      expect(result).toEqual({
        key: { text: 'Name' },
        value: { text: 'Sarah A Farmer' }
      })
    })

    it('should create name row when only first and last names are present', () => {
      const name = { first: 'Jane', last: 'Smith' }

      const result = controller.createCustomerNameRow(name)

      expect(result).toEqual({
        key: { text: 'Name' },
        value: { text: 'Jane Smith' }
      })
    })

    it('should return null when name is missing', () => {
      const result = controller.createCustomerNameRow(null)
      expect(result).toBeNull()
    })

    it('should return null when name parts are empty', () => {
      const name = { first: '', middle: '', last: '' }
      const result = controller.createCustomerNameRow(name)
      expect(result).toBeNull()
    })
  })

  describe('createBusinessNameRow', () => {
    it('should create business name row when name is present', () => {
      const result = controller.createBusinessNameRow('Test Business Ltd')

      expect(result).toEqual({
        key: { text: 'Business name' },
        value: { text: 'Test Business Ltd' }
      })
    })

    it('should return null when business name is missing', () => {
      const result = controller.createBusinessNameRow(null)
      expect(result).toBeNull()
    })
  })

  describe('createAddressRow', () => {
    it('should create address row with all fields', () => {
      const address = {
        line1: 'Line 1',
        line2: 'Line 2',
        line3: 'Line 3',
        street: 'Main Street',
        city: 'Test City',
        postalCode: 'TE1 1ST'
      }

      const result = controller.createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: {
          html: 'Line 1<br/>Line 2<br/>Line 3<br/>Main Street<br/>Test City<br/>TE1 1ST'
        }
      })
    })

    it('should filter out empty address parts', () => {
      const address = {
        line1: 'Line 1',
        line2: '',
        line3: '  ,  ',
        street: null,
        city: 'Test City',
        postalCode: 'TE1 1ST'
      }

      const result = controller.createAddressRow(address)

      expect(result).toEqual({
        key: { text: 'Address' },
        value: { html: 'Line 1<br/>,<br/>Test City<br/>TE1 1ST' }
      })
    })

    it('should return null when address is missing', () => {
      const result = controller.createAddressRow(null)
      expect(result).toBeNull()
    })

    it('should return null when all address parts are empty', () => {
      const address = {
        line1: '',
        line2: '  ',
        line3: '     ',
        street: null,
        city: '',
        postalCode: '    '
      }

      const result = controller.createAddressRow(address)
      expect(result).toBeNull()
    })
  })

  describe('createSbiRow', () => {
    it('should always create SBI row', () => {
      const result = controller.createSbiRow('SBI123456')

      expect(result).toEqual({
        key: { text: 'SBI number' },
        value: { text: 'SBI123456' }
      })
    })
  })

  describe('createContactDetailsRow', () => {
    it('should create contact details with both mobile and email', () => {
      const result = controller.createContactDetailsRow('07123456789', 'test@example.com')

      expect(result).toEqual({
        key: { text: 'Contact details' },
        value: { html: 'formatted-07123456789<br/>test@example.com' }
      })
    })

    it('should create contact details with only mobile', () => {
      const result = controller.createContactDetailsRow('07123456789', null)

      expect(result).toEqual({
        key: { text: 'Contact details' },
        value: { html: 'formatted-07123456789' }
      })
    })

    it('should create contact details with only email', () => {
      const result = controller.createContactDetailsRow(null, 'test@example.com')

      expect(result).toEqual({
        key: { text: 'Contact details' },
        value: { html: 'test@example.com' }
      })
    })

    it('should return null when both mobile and email are missing', () => {
      const result = controller.createContactDetailsRow(null, null)
      expect(result).toBeNull()
    })
  })

  describe('handleError', () => {
    it('should log error and return error view', () => {
      const error = new Error('Test error')
      const baseViewModel = { baseProperty: 'value' }

      const result = controller.handleError(error, baseViewModel, mockH)

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
        'Unable to find farm information, please try again later.'
      )
    })
  })
})
