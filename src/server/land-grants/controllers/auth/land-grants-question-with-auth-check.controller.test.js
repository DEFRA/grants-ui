import { beforeEach, describe, expect, test, vi } from 'vitest'
import LandGrantsQuestionWithAuthCheckController from './land-grants-question-with-auth-check.controller'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { getCachedAuthParcels, setCachedAuthParcels } from '~/src/server/land-grants/services/parcel-cache.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchParcelsFromDal: vi.fn()
}))

vi.mock('~/src/server/land-grants/services/parcel-cache.js', () => ({
  getCachedAuthParcels: vi.fn(),
  setCachedAuthParcels: vi.fn()
}))

describe('LandGrantsQuestionWithAuthCheckController', () => {
  let controller
  let mockRequest
  let mockH

  beforeEach(() => {
    controller = new LandGrantsQuestionWithAuthCheckController()
    mockRequest = {
      query: {},
      payload: {},
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

    getCachedAuthParcels.mockReturnValue(null)

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
      expect(debug).toHaveBeenCalledWith(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        {
          endpoint: 'Consolidated view',
          errorMessage: 'fetch parcel data for auth check: API connection failed'
        },
        mockRequest
      )
      expect(controller.renderUnauthorisedView).toHaveBeenCalledWith(mockH)
    })

    test('uses cached parcels instead of fetching when cache hit', async () => {
      getCachedAuthParcels.mockReturnValue(['sheet1-parcel1', 'sheet2-parcel2'])

      const result = await controller.performAuthCheck(mockRequest, mockH, 'sheet1-parcel1')

      expect(getCachedAuthParcels).toHaveBeenCalledWith('987654321')
      expect(fetchParcelsFromDal).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    test('fetches and caches parcels on cache miss', async () => {
      fetchParcelsFromDal.mockResolvedValue([{ sheetId: 'sheet1', parcelId: 'parcel1' }])

      const result = await controller.performAuthCheck(mockRequest, mockH, 'sheet1-parcel1')

      expect(getCachedAuthParcels).toHaveBeenCalledWith('987654321')
      expect(fetchParcelsFromDal).toHaveBeenCalledWith(mockRequest)
      expect(setCachedAuthParcels).toHaveBeenCalledWith('987654321', ['sheet1-parcel1'])
      expect(result).toBeNull()
    })

    test('does not cache when fetchParcelsFromDal throws', async () => {
      fetchParcelsFromDal.mockRejectedValue(new Error('API error'))

      await controller.performAuthCheck(mockRequest, mockH, 'sheet1-parcel1')

      expect(setCachedAuthParcels).not.toHaveBeenCalled()
    })
  })

  describe('resolveParcelId', () => {
    test('returns query.parcelId when present', () => {
      mockRequest.query = { parcelId: 'query-parcel' }
      mockRequest.payload = { selectedLandParcel: 'payload-parcel' }
      const context = { state: { selectedLandParcel: 'state-parcel' } }

      expect(controller.resolveParcelId(mockRequest, context)).toBe('query-parcel')
    })

    test('returns payload.selectedLandParcel when query is absent', () => {
      mockRequest.query = {}
      mockRequest.payload = { selectedLandParcel: 'payload-parcel' }
      const context = { state: { selectedLandParcel: 'state-parcel' } }

      expect(controller.resolveParcelId(mockRequest, context)).toBe('payload-parcel')
    })

    test('returns state.selectedLandParcel when query and payload are absent', () => {
      mockRequest.query = {}
      mockRequest.payload = {}
      const context = { state: { selectedLandParcel: 'state-parcel' } }

      expect(controller.resolveParcelId(mockRequest, context)).toBe('state-parcel')
    })

    test('returns null when no parcel ID found', () => {
      mockRequest.query = {}
      mockRequest.payload = {}
      const context = { state: {} }

      expect(controller.resolveParcelId(mockRequest, context)).toBeNull()
    })
  })

  describe('makeGetRouteHandler', () => {
    test('returns auth error when performAuthCheck fails', async () => {
      controller.performAuthCheck = vi.fn().mockResolvedValue('unauthorised')
      controller.handleGet = vi.fn()
      mockRequest.query = { parcelId: 'sheet1-parcel1' }
      const context = { state: {} }

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, context, mockH)

      expect(result).toBe('unauthorised')
      expect(controller.handleGet).not.toHaveBeenCalled()
    })

    test('delegates to handleGet when auth passes', async () => {
      controller.performAuthCheck = vi.fn().mockResolvedValue(null)
      controller.handleGet = vi.fn().mockResolvedValue('get-response')
      const context = { state: {} }

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, context, mockH)

      expect(result).toBe('get-response')
      expect(controller.handleGet).toHaveBeenCalledWith(mockRequest, context, mockH)
    })
  })

  describe('makePostRouteHandler', () => {
    test('returns auth error when performAuthCheck fails', async () => {
      controller.performAuthCheck = vi.fn().mockResolvedValue('unauthorised')
      controller.handlePost = vi.fn()
      mockRequest.query = { parcelId: 'sheet1-parcel1' }
      const context = { state: {} }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, context, mockH)

      expect(result).toBe('unauthorised')
      expect(controller.handlePost).not.toHaveBeenCalled()
    })

    test('delegates to handlePost when auth passes', async () => {
      controller.performAuthCheck = vi.fn().mockResolvedValue(null)
      controller.handlePost = vi.fn().mockResolvedValue('post-response')
      const context = { state: {} }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, context, mockH)

      expect(result).toBe('post-response')
      expect(controller.handlePost).toHaveBeenCalledWith(mockRequest, context, mockH)
    })
  })
})
