import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { vi } from 'vitest'
import { debug } from '~/src/server/common/helpers/logging/log.js'
import { fetchParcels } from '~/src/server/land-grants/services/land-grants.service.js'
import SelectLandParcelPageController from './select-land-parcel-page.controller.js'
import {
  PARCELS_WITH_SIZE,
  USER_CONTEXT,
  makeLandGrantsRequest,
  makeViewToolkit,
  mockFormatParcelImplementations,
  stubControllerMethods
} from '~/src/server/land-grants/test-helpers.js'

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', async () => {
  const { makeQuestionPageControllerMock } = await import('~/src/__mocks__')
  return makeQuestionPageControllerMock('select-land-parcel')
})

vi.mock('~/src/server/task-list/task-list.helper.js', () => ({
  withTaskContext: (Base) => Base
}))

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchParcelsFromDal: vi.fn().mockResolvedValue([])
}))

vi.mock('~/src/server/land-grants/services/parcel-cache.js', () => ({
  getCachedAuthParcels: vi.fn().mockReturnValue(null),
  setCachedAuthParcels: vi.fn()
}))

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  fetchParcels: vi.fn()
}))

vi.mock('~/src/shared/format-parcel.js')

const controllerParcelsResponse = [
  {
    value: 'SD7946-0155',
    text: 'SD7946 0155',
    hint: { text: 'Total size 4.0383 hectares' }
  },
  {
    value: 'SD7846-4509',
    text: 'SD7846 4509',
    hint: { text: 'Total size 0.0633 square metres' }
  }
]

describe('SelectLandParcelPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const renderedViewMock = 'mock-rendered-view'
  const state = { landParcels: ['sheet123'] }
  const post = () => controller.makePostRouteHandler()(mockRequest, mockContext, mockH)
  const get = () => controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

  const setupContext = (state = {}) => ({ state })

  beforeEach(() => {
    const mockModelForViewModel = {
      def: { metadata: { tasklist: {} } },
      pages: [],
      page: { def: { pages: [] } }
    }
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Select Land Parcel',
      serviceUrl: '/service',
      page: {
        model: mockModelForViewModel,
        def: { pages: [], metadata: { tasklist: {} } }
      }
    })

    const mockModel = {
      def: { metadata: { tasklist: {} } },
      getSection: vi.fn()
    }
    controller = stubControllerMethods(new SelectLandParcelPageController(mockModel, {}), {
      proceed: 'next',
      nextPath: '/next-page'
    })

    mockFormatParcelImplementations()
    fetchParcels.mockResolvedValue(PARCELS_WITH_SIZE)

    mockRequest = makeLandGrantsRequest()
    mockContext = setupContext({ sbi: 117235001, customerReference: 1100598138 })
    mockH = makeViewToolkit(renderedViewMock)
  })

  afterEach(vi.clearAllMocks)

  describe('resolveParcelIds', () => {
    it('returns array from payload', () => {
      mockRequest.payload = { landParcels: 'p1' }

      expect(controller.resolveParcelIds(mockRequest)).toEqual(['p1'])
    })

    it('returns empty array when nothing provided', () => {
      mockRequest.payload = {}
      mockRequest.query = {}

      expect(controller.resolveParcelIds(mockRequest)).toEqual([])
    })
  })

  describe('GET route handler', () => {
    it('gets parcels info and renders view', async () => {
      const result = await get()

      expect(fetchParcels).toHaveBeenCalledWith(mockRequest, USER_CONTEXT)
      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel',
          parcels: controllerParcelsResponse
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it.each([
      ['the fetch rejects', () => fetchParcels.mockRejectedValue(new Error('not found'))],
      ['the fetch times out', () => fetchParcels.mockRejectedValue(new Error('Operation timed out after 30000ms'))],
      ['no parcels come back', () => fetchParcels.mockResolvedValue([])]
    ])('renders the parcel-information error when %s', async (_case, arrange) => {
      arrange()

      const result = await get()

      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel',
          errors: ['Unable to find parcel information, please try again later or contact the Rural Payments Agency.']
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it('logs the caught error at error level when fetching parcels fails', async () => {
      const thrown = new Error('not found')
      fetchParcels.mockRejectedValue(thrown)

      await get()

      const [logCode, messageOptions, loggedRequest] = debug.mock.calls[0]
      expect(logCode.level).toBe('error')
      expect(logCode.error).toBe(thrown)
      expect(logCode.messageFunc()).toBe('Unexpected error when fetching parcel data')
      expect(messageOptions).toEqual({})
      expect(loggedRequest).toBe(mockRequest)
    })
  })

  describe('POST route handler', () => {
    it('redirects with selected parcel id in query', async () => {
      mockRequest.payload = state
      mockContext = setupContext({ existing: 'value' })

      const result = await post()

      expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, [state.landParcels[0]])
      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, `/next-page?parcelId=${state.landParcels[0]}`)
      expect(result).toBe('next')
    })

    it('should return the unauthorized response when the user does not own the selected land parcel', async () => {
      mockRequest.payload = state
      mockContext = setupContext({ existing: 'value' })
      controller.performAuthCheck.mockResolvedValue('failed auth check')

      const result = await post()

      expect(result).toEqual('failed auth check')
    })

    it.each([
      ['no parcel was selected', { action: 'validate' }, {}],
      ['the selected parcel is blank', { action: 'validate', landParcels: [''] }, {}],
      ['only the query carries a parcel id', { action: 'validate' }, { parcelId: 'queryParcel' }]
    ])('shows the "select a parcel" error on validate when %s', async (_case, payload, query) => {
      mockRequest.payload = payload
      mockRequest.query = query
      mockContext = setupContext({ existing: 'value' })

      const result = await post()

      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).not.toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel',
          errors: 'Select a land parcel'
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it.each([
      ['the payload has no parcel', {}],
      ['the payload is null', null]
    ])('proceeds with an undefined parcel id when %s', async (_case, payload) => {
      mockRequest.payload = payload
      mockContext = setupContext({})

      const result = await post()

      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-page?parcelId=undefined')
      expect(result).toBe('next')
    })

    it('should not show error when action is not validate even if selectedLandParcel missing', async () => {
      mockRequest.payload = { action: 'other', landParcels: [''] }
      mockContext = setupContext({})

      await post()

      expect(mockH.view).not.toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          errors: 'Select a land parcel'
        })
      )
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-page?parcelId=')
    })

    it('should handle error when fetching parcels for validation error', async () => {
      mockRequest.payload = { action: 'validate' }
      mockContext = setupContext({ existing: 'value', landParcels: { 'SD7946-0155': { actionsObj: { ACTION1: {} } } } })
      fetchParcels.mockRejectedValue(new Error('Fetch error'))

      const result = await post()

      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          errors: 'Select a land parcel',
          parcels: []
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it('logs the caught error at error level when validation re-fetch fails', async () => {
      const thrown = new Error('Fetch error')
      mockRequest.payload = { action: 'validate' }
      mockContext = setupContext({ existing: 'value', landParcels: { 'SD7946-0155': { actionsObj: { ACTION1: {} } } } })
      fetchParcels.mockRejectedValue(thrown)

      await post()

      const [logCode, messageOptions, loggedRequest] = debug.mock.calls[0]
      expect(logCode.level).toBe('error')
      expect(logCode.error).toBe(thrown)
      expect(logCode.messageFunc()).toBe('Error fetching parcels for validation error rendering')
      expect(messageOptions).toEqual({})
      expect(loggedRequest).toBe(mockRequest)
    })

    it('should correctly calculate actions count', async () => {
      mockRequest.payload = { action: 'validate' }
      mockContext = setupContext({
        landParcels: {
          'SD7946-0155': { actionsObj: { ACTION1: {}, ACTION2: {} } }
        }
      })

      await post()

      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          parcels: expect.arrayContaining([
            expect.objectContaining({
              hint: { text: 'Total size 4.0383 hectares, 2 actions added' }
            })
          ])
        })
      )
    })

    it('should handle parcel with no actions object', async () => {
      mockRequest.payload = { action: 'validate' }
      mockContext = setupContext({
        landParcels: {
          'SD7946-0155': { size: {} } // No actionsObj
        }
      })

      await post()

      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          parcels: expect.arrayContaining([
            expect.objectContaining({
              hint: { text: 'Total size 4.0383 hectares' }
            })
          ])
        })
      )
    })
  })
})
