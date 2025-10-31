import { beforeEach, describe, expect, test, vi } from 'vitest'
import LandGrantsQuestionWithAuthCheckController from './land-grants-question-with-auth-check.controller'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchParcelsFromDal: vi.fn()
}))

describe('LandGrantsQuestionWithAuthCheckController', () => {
  let controller
  let mockRequest
  let mockH

  beforeEach(() => {
    controller = new LandGrantsQuestionWithAuthCheckController()
    mockRequest = {
      auth: {
        credentials: {
          crn: '1234567890',
          sbi: '987654321'
        }
      }
    }
    mockH = {
      response: vi.fn().mockReturnThis(),
      view: vi.fn(),
      code: vi.fn()
    }

    fetchParcelsFromDal.mockResolvedValue([
      { sheetId: 'SD7946', parcelId: '0155' },
      { sheetId: 'SD7846', parcelId: '4509' }
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('performAuthCheck', () => {
    test('fetches parcels and calls renderUnauthorisedView if parcel does not belong to SBI', async () => {
      fetchParcelsFromDal.mockResolvedValue([{ sheetId: 'sheet1', parcelId: 'parcel1' }])
      vi.spyOn(controller, 'renderUnauthorisedView')

      await controller.performAuthCheck(mockRequest, mockH, 'sheet3-parcel3')

      expect(fetchParcelsFromDal).toHaveBeenCalledWith(mockRequest)
      expect(controller.renderUnauthorisedView).toHaveBeenCalledWith(mockH)
    })

    test('returns null if parcel belongs to SBI', async () => {
      fetchParcelsFromDal.mockResolvedValue([{ sheetId: 'sheet1', parcelId: 'parcel1' }])

      const result = await controller.performAuthCheck(mockRequest, mockH, 'sheet1-parcel1')

      expect(fetchParcelsFromDal).toHaveBeenCalledWith(mockRequest)
      expect(result).toBeNull()
    })
  })

  describe('renderUnauthorisedView', () => {
    test('returns a forbidden response', () => {
      controller.renderUnauthorisedView(mockH)

      expect(mockH.response).toHaveBeenCalledWith(mockH.view('unauthorised'))
      expect(mockH.response().code).toHaveBeenCalledWith(403)
    })
  })
})
