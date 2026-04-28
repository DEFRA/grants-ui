import { vi } from 'vitest'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import { fetchParcels } from '../../services/land-grants.service.js'
import { mapParcelsToViewModel } from '../../view-models/parcel.view-model.js'
import CommonSelectLandParcelPageController from './common-select-land-parcel-page.controller.js'

vi.mock('../../services/land-grants.service.js', () => ({
  fetchParcels: vi.fn()
}))

vi.mock('../../view-models/parcel.view-model.js', () => ({
  mapParcelsToViewModel: vi.fn()
}))

const mockParcels = [
  { sheetId: 'S1', parcelId: 'P1', area: { value: 10 } },
  { sheetId: 'S2', parcelId: 'P2', area: { value: 20 } }
]

const mappedParcels = [
  { value: 'S1-P1', text: 'Parcel 1' },
  { value: 'S2-P2', text: 'Parcel 2' }
]

const setupRequest = (method = 'get') => ({
  method,
  payload: {},
  query: {},
  logger: mockRequestLogger(),
  auth: {
    credentials: { sbi: '123' }
  }
})

const setupContext = (state = {}) => ({ state })

const setupH = () => ({
  view: vi.fn().mockReturnValue('view'),
  redirect: vi.fn()
})

const createController = (config = {}) => {
  const model = {
    def: {
      metadata: {
        pageConfig: {
          '/test': config
        }
      }
    }
  }

  const pageDef = { path: '/test' }

  const controller = new CommonSelectLandParcelPageController(model, pageDef)

  setupControllerMocks(controller, {
    proceed: 'next',
    nextPath: '/next'
  })

  controller.getViewModel = vi.fn().mockReturnValue({
    pageTitle: 'Select parcel'
  })

  return controller
}

describe('CommonSelectLandParcelPageController', () => {
  beforeEach(() => {
    fetchParcels.mockResolvedValue(mockParcels)
    mapParcelsToViewModel.mockReturnValue(mappedParcels)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('resolveParcelIds', () => {
    it('returns payload values for POST', () => {
      const controller = createController()
      const request = setupRequest('post')
      request.payload = { landParcels: 'S1-P1' }

      expect(controller.resolveParcelIds(request)).toEqual(['S1-P1'])
    })

    it('returns query value for GET', () => {
      const controller = createController()
      const request = setupRequest('get')
      request.query = { parcelId: 'S1-P1' }

      expect(controller.resolveParcelIds(request)).toEqual(['S1-P1'])
    })

    it('returns empty array when nothing provided', () => {
      const controller = createController()
      const request = setupRequest('get')

      expect(controller.resolveParcelIds(request)).toEqual([])
    })
  })

  describe('makeGetRouteHandler (returnUrl stripping)', () => {
    it('redirects to same path when returnUrl is present', async () => {
      const controller = createController()
      const request = setupRequest('get')

      request.query = { returnUrl: '/summary' }
      request.path = '/test'

      const context = setupContext({})
      const h = setupH()

      const handler = controller.makeGetRouteHandler()

      await handler(request, context, h)

      expect(h.redirect).toHaveBeenCalledWith('/test')
      expect(h.redirect).toHaveBeenCalledTimes(1)
      expect(h.view).not.toHaveBeenCalled()
    })

    it('calls normal GET handler when returnUrl is NOT present', async () => {
      const controller = createController()
      const request = setupRequest('get')

      request.query = {}
      request.path = '/test'

      const context = setupContext({})
      const h = setupH()

      const handler = controller.makeGetRouteHandler()

      await handler(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          parcels: mappedParcels
        })
      )

      expect(h.redirect).not.toHaveBeenCalled()
    })
  })

  describe('handleGet', () => {
    it('renders parcels successfully', async () => {
      const controller = createController({ enableMultipleParcelSelect: true })
      const request = setupRequest()

      const context = setupContext({ landParcels: ['S1-P1'] })

      const h = setupH()

      await controller.handleGet(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          parcels: mappedParcels,
          selectionMode: 'multiple',
          selectedParcelIds: ['S1-P1']
        })
      )
    })

    it('renders error when no parcels returned', async () => {
      mapParcelsToViewModel.mockReturnValue([])

      const controller = createController()
      const request = setupRequest()
      const context = setupContext({})
      const h = setupH()

      await controller.handleGet(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          parcels: [],
          errors: ['Unable to find parcel information, please try again later or contact the Rural Payments Agency.']
        })
      )
    })

    it('handles fetch error', async () => {
      fetchParcels.mockRejectedValue(new Error('fail'))

      const controller = createController()
      const request = setupRequest()
      const context = setupContext({})
      const h = setupH()

      await controller.handleGet(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          errors: ['Unable to find parcel information, please try again later or contact the Rural Payments Agency.']
        })
      )
    })

    it('handles throw during fetch', async () => {
      fetchParcels.mockRejectedValue('string error')

      const controller = createController()
      const request = setupRequest()
      const context = setupContext({})
      const h = setupH()

      await controller.handleGet(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          errors: ['Unable to find parcel information, please try again later or contact the Rural Payments Agency.']
        })
      )
    })
  })

  describe('handlePost', () => {
    it('returns error when nothing selected (single)', async () => {
      const controller = createController({ enableMultipleParcelSelect: false })
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      controller.mergeState = vi.fn()

      await controller.handlePost(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          errors: 'Select a land parcel'
        })
      )
    })

    it('returns error when nothing selected (multiple)', async () => {
      const controller = createController({ enableMultipleParcelSelect: true })
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      controller.mergeState = vi.fn()

      await controller.handlePost(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          errors: 'Select at least one land parcel'
        })
      )
    })

    it('merges state and calculates total area', async () => {
      const controller = createController()
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      request.payload = { landParcels: ['S1-P1', 'S2-P2'] }

      controller.mergeState = vi.fn()

      const result = await controller.handlePost(request, context, h)

      expect(fetchParcels).toHaveBeenCalled()

      expect(controller.mergeState).toHaveBeenCalledWith(request, context.state, {
        landParcels: ['S1-P1', 'S2-P2'],
        landParcelsDisplay: 'S1-P1, S2-P2',
        landParcelMetadata: [
          { parcelId: 'S1-P1', areaHa: 10 },
          { parcelId: 'S2-P2', areaHa: 20 }
        ],
        totalHectaresForSelectedParcels: 30,
        additionalAnswers: { totalHectaresForSelectedParcels: 30 }
      })

      expect(controller.setState).not.toHaveBeenCalled()

      expect(controller.proceed).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.not.objectContaining({
            returnUrl: expect.anything()
          })
        }),
        h,
        '/next'
      )

      expect(result).toBe('next')
    })

    it('strips returnUrl from request before proceeding', async () => {
      const controller = createController()
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      request.payload = { landParcels: ['S1-P1'] }
      request.query = { returnUrl: '/summary', somethingElse: 'x' }

      controller.mergeState = vi.fn()

      await controller.handlePost(request, context, h)

      const passedRequest = controller.proceed.mock.calls[0][0]

      expect(passedRequest.query).toEqual({ somethingElse: 'x' })
      expect(passedRequest.query.returnUrl).toBeUndefined()
    })

    it('rounds totalHectaresForSelectedParcels to 4dp to avoid float precision issues', async () => {
      fetchParcels.mockResolvedValue([
        { sheetId: 'S1', parcelId: 'P1', area: { value: 25.3874 } },
        { sheetId: 'S2', parcelId: 'P2', area: { value: 169.8586 } }
      ])

      const controller = createController()
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      request.payload = { landParcels: ['S1-P1', 'S2-P2'] }
      controller.mergeState = vi.fn()

      await controller.handlePost(request, context, h)

      expect(controller.mergeState).toHaveBeenCalledWith(
        request,
        context.state,
        expect.objectContaining({
          totalHectaresForSelectedParcels: 195.246,
          additionalAnswers: { totalHectaresForSelectedParcels: 195.246 }
        })
      )
    })

    it('sets areaHa to null when parcel has no area value', async () => {
      fetchParcels.mockResolvedValue([{ sheetId: 'S1', parcelId: 'P1', area: { value: null } }])

      const controller = createController()
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      request.payload = { landParcels: ['S1-P1'] }
      controller.mergeState = vi.fn()

      await controller.handlePost(request, context, h)

      expect(controller.mergeState).toHaveBeenCalledWith(
        request,
        context.state,
        expect.objectContaining({
          landParcelMetadata: [{ parcelId: 'S1-P1', areaHa: null }],
          totalHectaresForSelectedParcels: 0
        })
      )
    })

    it('handles fetch error gracefully for validation', async () => {
      fetchParcels.mockRejectedValue(new Error('fail'))

      const controller = createController()
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      controller.mergeState = vi.fn()

      await controller.handlePost(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          parcels: mappedParcels,
          errors: 'Select a land parcel'
        })
      )
    })

    it('shows error when total area is below minimumAreaHa threshold', async () => {
      const controller = createController({ enableMultipleParcelSelect: true, minimumAreaHa: 0.5 })
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      // S1-P1 has area 10 but we override to a small parcel
      fetchParcels.mockResolvedValue([{ sheetId: 'S1', parcelId: 'P1', area: { value: 0.1654 } }])
      mapParcelsToViewModel.mockReturnValue([{ value: 'S1-P1', text: 'PF 2617 0561' }])
      request.payload = { landParcels: 'S1-P1' }

      controller.mergeState = vi.fn()

      await controller.handlePost(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          errors: 'Total area of selected land parcels must be more than 0.5ha'
        })
      )
      expect(controller.mergeState).not.toHaveBeenCalled()
    })

    it('proceeds when total area meets minimumAreaHa threshold', async () => {
      const controller = createController({ minimumAreaHa: 0.5 })
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      request.payload = { landParcels: ['S1-P1', 'S2-P2'] }

      controller.mergeState = vi.fn()

      const result = await controller.handlePost(request, context, h)

      expect(h.view).not.toHaveBeenCalled()
      expect(result).toBe('next')
    })

    it('proceeds without area check when minimumAreaHa is not configured', async () => {
      const controller = createController()
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      fetchParcels.mockResolvedValue([{ sheetId: 'S1', parcelId: 'P1', area: { value: 0.001 } }])
      request.payload = { landParcels: 'S1-P1' }

      controller.mergeState = vi.fn()

      const result = await controller.handlePost(request, context, h)

      expect(h.view).not.toHaveBeenCalled()
      expect(result).toBe('next')
    })

    it('handles non-Error throw during fetch gracefully for validation', async () => {
      fetchParcels.mockRejectedValue('string error')

      const controller = createController()
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      controller.mergeState = vi.fn()

      await controller.handlePost(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          parcels: mappedParcels,
          errors: 'Select a land parcel'
        })
      )
    })
  })
})
