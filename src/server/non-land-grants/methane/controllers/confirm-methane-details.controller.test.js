import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import ConfirmMethaneDetailsController from './confirm-methane-details.controller.js'
import { fetchBusinessAndCPH } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import {
  createAddressRow,
  createBusinessNameRow,
  createContactDetailsRow,
  createCustomerNameRow,
  createSbiRow
} from '~/src/server/common/helpers/create-rows.js'

// Mock dependencies
vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js')
vi.mock('~/src/server/common/helpers/create-rows.js')
vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLoggerFactoryWithCustomMethods } = await import('~/src/__mocks__')

  return {
    logger: mockLoggerFactoryWithCustomMethods({
      error: vi.fn()
    })
  }
})

const mockData = {
  business: {
    name: 'Test Methane Business',
    address: {
      line1: 'Line 1',
      line2: 'Line 2',
      city: 'Test City',
      postalCode: 'TE1 1ST'
    },
    phone: { mobile: '07123456789' },
    email: { address: 'test@methane.com' },
    type: { type: 'Limited Company' },
    vat: 'GB123456789'
  },
  customer: {
    name: { first: 'John', middle: 'A', last: 'Smith' }
  },
  countyParishHoldings: ['12/345/6789', '12/345/6790']
}

describe('ConfirmMethaneDetailsController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    controller = new ConfirmMethaneDetailsController()
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
          organisationId: 'SBI123456'
        }
      }
    }

    mockContext = {
      state: { someState: 'value' }
    }

    mockH = {
      view: vi.fn().mockReturnValue('mocked-view'),
      redirect: vi.fn()
    }

    // Mock the parent class method
    vi.spyOn(QuestionPageController.prototype, 'getViewModel').mockReturnValue({
      baseModel: 'data'
    })

    // Reset all mocks
    vi.clearAllMocks()
  })

  describe('class properties', () => {
    it('should have correct viewName', () => {
      expect(controller.viewName).toBe('confirm-methane-details')
    })

    it('should have correct error message', () => {
      expect(ConfirmMethaneDetailsController.ERROR_MESSAGE).toBe(
        'Unable to find farm information, please try again later.'
      )
    })
  })

  describe('makeGetRouteHandler', () => {
    beforeEach(() => {
      vi.mocked(fetchBusinessAndCPH).mockResolvedValue(mockData)
      vi.mocked(createCustomerNameRow).mockReturnValue({ key: { text: 'Name' }, value: { text: 'John A Smith' } })
      vi.mocked(createBusinessNameRow).mockReturnValue({
        key: { text: 'Business name' },
        value: { text: 'Test Methane Business' }
      })
      vi.mocked(createSbiRow).mockReturnValue({ key: { text: 'SBI number' }, value: { text: 'SBI123456' } })
      vi.mocked(createContactDetailsRow).mockReturnValue({
        key: { text: 'Contact details' },
        value: { text: '07123456789, test@methane.com' }
      })
      vi.mocked(createAddressRow).mockReturnValue({
        key: { text: 'Address' },
        value: { html: 'Line 1<br/>Line 2<br/>Test City<br/>TE1 1ST' }
      })
    })

    it('should return view with farm details on successful request', async () => {
      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(fetchBusinessAndCPH).toHaveBeenCalledWith(mockRequest)
      expect(QuestionPageController.prototype.getViewModel).toHaveBeenCalledWith(mockRequest, mockContext)
      expect(mockH.view).toHaveBeenCalledWith('confirm-methane-details', {
        baseModel: 'data',
        farmDetails: {
          rows: expect.arrayContaining([
            { key: { text: 'Name' }, value: { text: 'John A Smith' } },
            { key: { text: 'Business name' }, value: { text: 'Test Methane Business' } },
            { key: { text: 'SBI number' }, value: { text: 'SBI123456' } },
            { key: { text: 'Contact details' }, value: { text: '07123456789, test@methane.com' } },
            { key: { text: 'Address' }, value: { html: 'Line 1<br/>Line 2<br/>Test City<br/>TE1 1ST' } }
          ])
        }
      })
    })

    it('should handle error when fetchBusinessAndCPH fails', async () => {
      const error = new Error('Service unavailable')
      vi.mocked(fetchBusinessAndCPH).mockRejectedValue(error)

      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirm-methane-details', {
        baseModel: 'data',
        error: {
          titleText: 'There is a problem',
          errorList: [
            {
              text: ConfirmMethaneDetailsController.ERROR_MESSAGE,
              href: ''
            }
          ]
        }
      })
    })
  })

  describe('buildFarmDetails', () => {
    beforeEach(() => {
      vi.mocked(fetchBusinessAndCPH).mockResolvedValue(mockData)
      vi.mocked(createCustomerNameRow).mockReturnValue({ key: { text: 'Name' }, value: { text: 'John A Smith' } })
      vi.mocked(createBusinessNameRow).mockReturnValue({
        key: { text: 'Business name' },
        value: { text: 'Test Methane Business' }
      })
      vi.mocked(createSbiRow).mockReturnValue({ key: { text: 'SBI number' }, value: { text: 'SBI123456' } })
      vi.mocked(createContactDetailsRow).mockReturnValue({
        key: { text: 'Contact details' },
        value: { text: '07123456789, test@methane.com' }
      })
      vi.mocked(createAddressRow).mockReturnValue({
        key: { text: 'Address' },
        value: { html: 'Line 1<br/>Line 2<br/>Test City<br/>TE1 1ST' }
      })
    })

    it('should build farm details with all row types', async () => {
      const result = await controller.buildFarmDetails(mockRequest)

      expect(fetchBusinessAndCPH).toHaveBeenCalledWith(mockRequest)
      expect(createCustomerNameRow).toHaveBeenCalledWith(mockData.customer?.name)
      expect(createBusinessNameRow).toHaveBeenCalledWith(mockData.business?.name)
      expect(createSbiRow).toHaveBeenCalledWith('SBI123456')
      expect(createContactDetailsRow).toHaveBeenCalledWith(null, '07123456789', 'test@methane.com')
      expect(createAddressRow).toHaveBeenCalledWith(mockData.business?.address)

      expect(result).toEqual({
        rows: expect.arrayContaining([
          { key: { text: 'Name' }, value: { text: 'John A Smith' } },
          { key: { text: 'Business name' }, value: { text: 'Test Methane Business' } },
          { key: { text: 'SBI number' }, value: { text: 'SBI123456' } },
          { key: { text: 'Contact details' }, value: { text: '07123456789, test@methane.com' } },
          { key: { text: 'Address' }, value: { html: 'Line 1<br/>Line 2<br/>Test City<br/>TE1 1ST' } }
        ])
      })
    })

    it('should filter out null rows', async () => {
      vi.mocked(createCustomerNameRow).mockReturnValue(null)
      vi.mocked(createBusinessNameRow).mockReturnValue({
        key: { text: 'Business name' },
        value: { text: 'Test Business' }
      })

      const result = await controller.buildFarmDetails(mockRequest)

      expect(result.rows).not.toContain(null)
      expect(result.rows.some((row) => row?.key?.text === 'Business name')).toBe(true)
    })
  })

  describe('createVATRow', () => {
    it('should return VAT row when VAT number is provided', () => {
      const result = controller.createVATRow('GB123456789')

      expect(result).toEqual({
        key: { text: 'VAT number' },
        value: { text: 'GB123456789' }
      })
    })

    it('should return null when VAT number is not provided', () => {
      expect(controller.createVATRow()).toBeNull()
      expect(controller.createVATRow('')).toBeNull()
      expect(controller.createVATRow(null)).toBeNull()
    })
  })

  describe('createCPHRow', () => {
    it('should return CPH row when holdings are provided', () => {
      const holdings = ['12/345/6789', '12/345/6790']

      const result = controller.createCPHRow(holdings)

      expect(result).toEqual({
        key: { text: 'County Parish Holdings' },
        value: { text: holdings }
      })
    })

    it('should return null when holdings array is empty', () => {
      const result = controller.createCPHRow([])
      expect(result).toBeNull()
    })
  })

  describe('createTypeRow', () => {
    it('should return type row when business type is provided', () => {
      const type = { type: 'Limited Company' }
      const result = controller.createTypeRow(type)

      expect(result).toEqual({
        key: { text: 'Type' },
        value: { text: 'Limited Company' }
      })
    })

    it('should return null when type is not provided', () => {
      expect(controller.createTypeRow()).toBeNull()
      expect(controller.createTypeRow(null)).toBeNull()
    })
  })

  describe('handleError', () => {
    it('should log error and return error view', () => {
      const error = new Error('Test error')
      const baseViewModel = { baseModel: 'data' }

      const result = controller.handleError('SBI123456', error, baseViewModel, mockH)

      expect(mockH.view).toHaveBeenCalledWith('confirm-methane-details', {
        baseModel: 'data',
        error: {
          titleText: 'There is a problem',
          errorList: [
            {
              text: ConfirmMethaneDetailsController.ERROR_MESSAGE,
              href: ''
            }
          ]
        }
      })

      expect(result).toBe('mocked-view')
    })
  })

  describe('makePostRouteHandler', () => {
    beforeEach(() => {
      vi.mocked(fetchBusinessAndCPH).mockResolvedValue(mockData)
    })

    it('should handle POST request with SBI and proceed to next page', async () => {
      const handler = controller.makePostRouteHandler()

      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchBusinessAndCPH).toHaveBeenCalledWith(mockRequest)
      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        someState: 'value',
        applicant: mockData
      })
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    it('should handle POST request without SBI and proceed to next page', async () => {
      mockRequest.auth.credentials.sbi = null

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchBusinessAndCPH).not.toHaveBeenCalled()
      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })

    it('should handle POST request with empty SBI and proceed to next page', async () => {
      mockRequest.auth.credentials.sbi = ''

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchBusinessAndCPH).not.toHaveBeenCalled()
      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-path')
      expect(result).toBe('redirected')
    })
  })
})
