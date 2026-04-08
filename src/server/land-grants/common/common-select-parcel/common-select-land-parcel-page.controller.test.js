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

const mockParcels = [{ id: 'p1' }]
const mappedParcels = [{ value: 'p1', text: 'Parcel 1' }]

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

  afterEach(vi.clearAllMocks)

  describe('resolveParcelIds', () => {
    it('returns payload values for POST', () => {
      const controller = createController()
      const request = setupRequest('post')
      request.payload = { landParcels: 'p1' }

      expect(controller.resolveParcelIds(request)).toEqual(['p1'])
    })

    it('returns query value for GET', () => {
      const controller = createController()
      const request = setupRequest('get')
      request.query = { parcelId: 'p1' }

      expect(controller.resolveParcelIds(request)).toEqual(['p1'])
    })

    it('returns empty array when nothing provided', () => {
      const controller = createController()
      const request = setupRequest('get')

      expect(controller.resolveParcelIds(request)).toEqual([])
    })
  })

  describe('handleGet', () => {
    it('renders parcels successfully', async () => {
      const controller = createController({ enableMultipleParcelSelect: true })
      const request = setupRequest()
      const context = setupContext({ landParcels: ['p1'] })
      const h = setupH()

      await controller.handleGet(request, context, h)

      expect(fetchParcels).toHaveBeenCalled()
      expect(mapParcelsToViewModel).toHaveBeenCalledWith(mockParcels)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          parcels: mappedParcels,
          selectionMode: 'multiple',
          selectedParcelIds: ['p1']
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

    it('passes config values to view', async () => {
      const controller = createController({
        topSection: '<p>Top</p>',
        bottomSection: '<p>Bottom</p>',
        selectionHint: 'Hint text',
        supportDetailsSummaryText: 'Help',
        supportDetailsHtml: '<p>Help content</p>'
      })

      const request = setupRequest()
      const context = setupContext({})
      const h = setupH()

      await controller.handleGet(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          topSection: '<p>Top</p>',
          bottomSection: '<p>Bottom</p>',
          selectionHint: 'Hint text',
          supportDetailsSummaryText: 'Help',
          supportDetailsHtml: '<p>Help content</p>'
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

      request.payload = {}

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

      request.payload = {}

      await controller.handlePost(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          errors: 'Select at least one land parcel'
        })
      )
    })

    it('merges state and proceeds when valid', async () => {
      const controller = createController()
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      request.payload = { landParcels: ['p1', 'p2'] }

      controller.mergeState = vi.fn()

      const result = await controller.handlePost(request, context, h)

      expect(controller.mergeState).toHaveBeenCalledWith(request, context.state, {
        landParcels: ['p1', 'p2']
      })

      expect(controller.proceed).toHaveBeenCalledWith(request, h, '/next?selectedParcelIds=p1,p2')

      expect(result).toBe('next')
    })

    it('handles fetch error during validation gracefully', async () => {
      fetchParcels.mockRejectedValue(new Error('fail'))

      const controller = createController()
      const request = setupRequest('post')
      const context = setupContext({})
      const h = setupH()

      request.payload = {}

      await controller.handlePost(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'common-select-land-parcel',
        expect.objectContaining({
          parcels: [],
          errors: 'Select a land parcel'
        })
      )
    })
  })
})
