import { beforeEach, describe, expect, test, vi } from 'vitest'
import LandGrantsQuestionWithAuthCheckController from './land-grants-question-with-auth-check.controller'
import { fetchParcels } from '../../services/land-grants.service'
vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  fetchParcels: vi.fn()
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

    fetchParcels.mockResolvedValue([
      { sheetId: 'SD7946', parcelId: '0155' },
      { sheetId: 'SD7846', parcelId: '4509' }
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('landParcelBelongsToSbi', () => {
    test('returns true if selectedLandParcel is in landParcelsForSbi', () => {
      controller.landParcelsForSbi = ['sheet1-parcel1', 'sheet2-parcel2']
      controller.selectedLandParcel = 'sheet1-parcel1'

      const result = controller.landParcelBelongsToSbi()

      expect(result).toBe(true)
    })

    test('returns false if selectedLandParcel is not in landParcelsForSbi', () => {
      controller.landParcelsForSbi = ['sheet1-parcel1', 'sheet2-parcel2']
      controller.selectedLandParcel = 'sheet3-parcel3'

      const result = controller.landParcelBelongsToSbi()

      expect(result).toBe(false)
    })
  })

  describe('performAuthCheck', () => {
    test('fetches parcels and calls renderUnauthorisedView if parcel does not belong to SBI', async () => {
      fetchParcels.mockResolvedValue([{ sheetId: 'sheet1', parcelId: 'parcel1' }])
      controller.landParcelsForSbi = []
      controller.selectedLandParcel = 'sheet3-parcel3'
      vi.spyOn(controller, 'renderUnauthorisedView')

      await controller.performAuthCheck(mockRequest, mockH)

      expect(fetchParcels).toHaveBeenCalledWith(mockRequest.auth.credentials.sbi)
      expect(controller.renderUnauthorisedView).toHaveBeenCalledWith(mockRequest, mockH)
    })

    test('returns null if parcel belongs to SBI', async () => {
      fetchParcels.mockResolvedValue([{ sheetId: 'sheet1', parcelId: 'parcel1' }])
      controller.selectedLandParcel = 'sheet1-parcel1'

      const result = await controller.performAuthCheck(mockRequest, mockH)

      expect(fetchParcels).toHaveBeenCalledWith(mockRequest.auth.credentials.sbi)
      expect(result).toBeNull()
    })
  })

  describe('renderUnauthorisedView', () => {
    test('returns a forbidden response', () => {
      controller.renderUnauthorisedView(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith(mockH.view('unauthorised'))
      expect(mockH.response().code).toHaveBeenCalledWith(403)
    })
  })
})
