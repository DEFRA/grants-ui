import { vi } from 'vitest'
import ConfirmMethaneDetailsController from './confirm-methane-details.controller.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

vi.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: vi.fn(() => ({
    error: vi.fn()
  }))
}))

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchBusinessAndCPH: vi.fn()
}))

vi.mock('~/src/server/land-grants/utils/format-phone.js', () => ({
  formatPhone: vi.fn((phone) => phone)
}))

describe('ConfirmMethaneDetailsController', () => {
  let controller
  let mockRequest
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new ConfirmMethaneDetailsController()
    mockRequest = mockHapiRequest({
      auth: {
        credentials: {
          sbi: '123456789',
          crn: '987654321'
        }
      }
    })
    mockH = mockHapiResponseToolkit()
    QuestionPageController.prototype.getViewModel = vi.fn()
    QuestionPageController.prototype.proceed = vi.fn()
    QuestionPageController.prototype.setState = vi.fn()
    QuestionPageController.prototype.getNextPath = vi.fn()
  })

  it('should be an instance of QuestionPageController', () => {
    expect(controller).toBeInstanceOf(QuestionPageController)
  })

  describe('makeGetRouteHandler', () => {
    it('should return the view with farm details on successful fetch', async () => {
      const mockFarmDetails = { rows: [{ key: { text: 'SBI number' }, value: { text: '123456789' } }] }
      controller.buildFarmDetails = vi.fn().mockResolvedValue(mockFarmDetails)
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, {}, mockH)
      expect(controller.buildFarmDetails).toHaveBeenCalledWith('987654321', '123456789')
      expect(mockH.view).toHaveBeenCalledWith(
        'confirm-methane-details',
        expect.objectContaining({ farmDetails: mockFarmDetails })
      )
    })

    it('should handle errors during farm details fetch', async () => {
      const error = new Error('Failed to fetch')
      controller.buildFarmDetails = vi.fn().mockRejectedValue(error)
      controller.handleError = vi.fn()
      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, {}, mockH)
      expect(controller.handleError).toHaveBeenCalledWith('123456789', error, undefined, mockH)
    })
  })

  describe('makePostRouteHandler', () => {
    it('should fetch applicant data, set state, and proceed', async () => {
      const mockApplicant = { business: { name: 'Test Farm' } }
      const { fetchBusinessAndCPH } = await import(
        '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
      )
      fetchBusinessAndCPH.mockResolvedValue(mockApplicant)
      const handler = controller.makePostRouteHandler()
      const context = { state: {} }
      await handler(mockRequest, context, mockH)
      expect(fetchBusinessAndCPH).toHaveBeenCalledWith('123456789', '987654321')
      expect(controller.setState).toHaveBeenCalledWith(mockRequest, { applicant: mockApplicant })
      expect(controller.proceed).toHaveBeenCalled()
    })
  })

  describe('buildFarmDetails', () => {
    it('should build farm details from fetched data', async () => {
      const mockData = {
        customer: { name: { first: 'John', last: 'Doe' } },
        business: {
          name: 'Test Farm',
          phone: { mobile: '12345' },
          email: { address: 'test@test.com' },
          address: { line1: '123 Street' },
          type: { type: 'Farmer' },
          vat: '123456789'
        },
        countyParishHoldings: ['CPH123']
      }
      const { fetchBusinessAndCPH } = await import(
        '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
      )
      fetchBusinessAndCPH.mockResolvedValue(mockData)
      const farmDetails = await controller.buildFarmDetails('987654321', '123456789')
      expect(farmDetails.rows).toHaveLength(8)
    })
  })

  describe('createRow functions', () => {
    it('should return null from createVATRow if vat is missing', () => {
      expect(controller.createVATRow(null)).toBeNull()
    })

    it('should return null from createCPHRow if countyParishHoldings is missing', () => {
      expect(controller.createCPHRow([])).toBeNull()
    })

    it('should return null from createCustomerNameRow if name is missing', () => {
      expect(controller.createCustomerNameRow(null)).toBeNull()
    })

    it('should return null from createBusinessNameRow if businessName is missing', () => {
      expect(controller.createBusinessNameRow(null)).toBeNull()
    })

    it('should return null from createAddressRow if address is missing', () => {
      expect(controller.createAddressRow(null)).toBeNull()
    })

    it('should return null from createTypeRow if type is missing', () => {
      expect(controller.createTypeRow(null)).toBeNull()
    })

    it('should return null from createContactDetailsRow if mobile and email are missing', () => {
      expect(controller.createContactDetailsRow(null, null)).toBeNull()
    })
  })
})
