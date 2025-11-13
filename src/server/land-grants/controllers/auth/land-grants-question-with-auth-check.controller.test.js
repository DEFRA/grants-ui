import { beforeEach, describe, expect, test, vi } from 'vitest'
import LandGrantsQuestionWithAuthCheckController from './land-grants-question-with-auth-check.controller'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { log } from '~/src/server/common/helpers/logging/log.js'

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchParcelsFromDal: vi.fn()
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    SYSTEM: {
      EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR'
    }
  }
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
    test('returns null if landParcel is not provided', async () => {
      const result = await controller.performAuthCheck(mockRequest, mockH, null)

      expect(fetchParcelsFromDal).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

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

    test('logs error and calls renderUnauthorisedView when fetchParcelsFromDal throws an error', async () => {
      const mockError = new Error('API connection failed')
      fetchParcelsFromDal.mockRejectedValue(mockError)
      vi.spyOn(controller, 'renderUnauthorisedView')

      await controller.performAuthCheck(mockRequest, mockH, 'sheet1-parcel1')

      expect(fetchParcelsFromDal).toHaveBeenCalledWith(mockRequest)
      expect(log).toHaveBeenCalledWith(
        'EXTERNAL_API_ERROR',
        {
          endpoint: 'Consolidated view',
          error: 'fetch parcel data for auth check: API connection failed'
        },
        mockRequest
      )
      expect(controller.renderUnauthorisedView).toHaveBeenCalledWith(mockH)
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
