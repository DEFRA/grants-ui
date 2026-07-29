import { beforeEach, describe, expect, test, vi } from 'vitest'
import QuestionPageWithParcelCheckController from './question-page-with-parcel-check.controller'
import { fetchAuthorisedParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => ({
  QuestionPageController: class {
    constructor(model, pageDef) {
      this.model = model
      this.pageDef = pageDef
    }

    makeGetRouteHandler() {
      return vi.fn().mockResolvedValue('get-response')
    }

    makePostRouteHandler() {
      return vi.fn().mockResolvedValue('post-response')
    }
  }
}))

vi.mock('~/src/server/task-list/task-list.helper.js', () => ({
  withTaskContext: (Base) => Base
}))

vi.mock('~/src/server/land-grants/services/parcel-cache.js', () => ({
  fetchAuthorisedParcelIds: vi.fn()
}))

describe('QuestionPageWithParcelCheckController', () => {
  let controller
  let mockRequest
  let mockH

  beforeEach(() => {
    const mockModel = { def: { metadata: { tasklist: {} } }, getSection: vi.fn() }
    controller = new QuestionPageWithParcelCheckController(mockModel, {})
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

    fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155', 'SD7846-4509'])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('performAuthCheck', () => {
    test('throws SystemError if resolveParcelIds returns a non-array', async () => {
      await expect(controller.performAuthCheck(mockRequest, mockH, 'not-an-array')).rejects.toThrow(SystemError)
      await expect(controller.performAuthCheck(mockRequest, mockH, 'not-an-array')).rejects.toThrow(
        'QuestionPageWithParcelCheckController.resolveParcelIds() must return an array or null'
      )
    })

    test('returns null if landParcel is not provided', async () => {
      const result = await controller.performAuthCheck(mockRequest, mockH, null)

      expect(fetchAuthorisedParcelIds).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    test('fetches parcels and calls renderUnauthorisedView if parcel does not belong to SBI', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(['sheet1-parcel1'])
      vi.spyOn(controller, 'renderUnauthorisedView')

      await controller.performAuthCheck(mockRequest, mockH, ['sheet3-parcel3'])

      expect(fetchAuthorisedParcelIds).toHaveBeenCalledWith(mockRequest)
      expect(controller.renderUnauthorisedView).toHaveBeenCalledWith(mockH)
    })

    test('returns null if parcel belongs to SBI', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(['sheet1-parcel1'])

      const result = await controller.performAuthCheck(mockRequest, mockH, ['sheet1-parcel1'])

      expect(fetchAuthorisedParcelIds).toHaveBeenCalledWith(mockRequest)
      expect(result).toBeNull()
    })

    test('calls renderUnauthorisedView when fetchAuthorisedParcelIds fails (returns null)', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(null)
      vi.spyOn(controller, 'renderUnauthorisedView')

      await controller.performAuthCheck(mockRequest, mockH, ['sheet1-parcel1'])

      expect(fetchAuthorisedParcelIds).toHaveBeenCalledWith(mockRequest)
      expect(controller.renderUnauthorisedView).toHaveBeenCalledWith(mockH)
    })
  })

  describe('resolveParcelIds', () => {
    test('throws SystemError if not overridden by subclass', () => {
      expect(() => controller.resolveParcelIds(mockRequest)).toThrow(SystemError)
      expect(() => controller.resolveParcelIds(mockRequest)).toThrow(
        'QuestionPageWithParcelCheckController must implement resolveParcelIds()'
      )
    })
  })

  describe('makeGetRouteHandler', () => {
    test('returns auth error when performAuthCheck fails', async () => {
      controller.resolveParcelIds = vi.fn().mockReturnValue(['sheet1-parcel1'])
      controller.performAuthCheck = vi.fn().mockResolvedValue('unauthorised')
      controller.handleGet = vi.fn()
      const context = { state: {} }

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, context, mockH)

      expect(result).toBe('unauthorised')
      expect(controller.handleGet).not.toHaveBeenCalled()
    })

    test('delegates to handleGet when auth passes', async () => {
      controller.resolveParcelIds = vi.fn().mockReturnValue(null)
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
      controller.resolveParcelIds = vi.fn().mockReturnValue(['sheet1-parcel1'])
      controller.performAuthCheck = vi.fn().mockResolvedValue('unauthorised')
      controller.handlePost = vi.fn()
      const context = { state: {} }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, context, mockH)

      expect(result).toBe('unauthorised')
      expect(controller.handlePost).not.toHaveBeenCalled()
    })

    test('delegates to handlePost when auth passes', async () => {
      controller.resolveParcelIds = vi.fn().mockReturnValue(null)
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
