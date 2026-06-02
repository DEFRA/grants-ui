// @ts-nocheck
import { vi } from 'vitest'
import MapSelectPageController from './map-select-page.controller.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'

const mockModel = {}

function makePageDef(config = {}) {
  return { config }
}

vi.mock('~/src/server/task-list/task-list.helper.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    withTaskContext: (Base) => Base
  }
})

function makeController(config = {}) {
  const controller = new MapSelectPageController(mockModel, makePageDef(config))
  setupControllerMocks(controller)
  controller.getViewModel = vi.fn().mockReturnValue({ pageTitle: 'Select a land parcel' })
  return controller
}

function makeRequest(payload = {}, path = '/select-land-parcel') {
  return { payload, path, query: {} }
}

function makeContext(state = {}) {
  return { state }
}

function makeH() {
  return {
    view: vi.fn().mockReturnValue('view-response'),
    redirect: vi.fn().mockReturnValue('redirect-response')
  }
}

describe('MapSelectPageController', () => {
  describe('constructor', () => {
    it('defaults multiSelect to false', () => {
      const controller = new MapSelectPageController(mockModel, makePageDef())
      expect(controller.multiSelect).toBe(false)
    })

    it('sets multiSelect true from pageDef.config', () => {
      const controller = new MapSelectPageController(mockModel, makePageDef({ multiSelect: true }))
      expect(controller.multiSelect).toBe(true)
    })

    it('sets multiSelect false when config.multiSelect is falsy', () => {
      const controller = new MapSelectPageController(mockModel, makePageDef({ multiSelect: false }))
      expect(controller.multiSelect).toBe(false)
    })
  })

  describe('handleGet', () => {
    it('renders the map view with multiSelect and formAction', async () => {
      const controller = makeController()
      const request = makeRequest({}, '/my-path')
      const context = makeContext()
      const h = makeH()

      await controller.handleGet(request, context, h)

      expect(h.view).toHaveBeenCalledWith(
        'map-select-parcel',
        expect.objectContaining({
          multiSelect: false,
          formAction: '/my-path'
        })
      )
    })

    it('passes multiSelect: true when configured', async () => {
      const controller = makeController({ multiSelect: true })
      const h = makeH()

      await controller.handleGet(makeRequest(), makeContext(), h)

      expect(h.view).toHaveBeenCalledWith(
        'map-select-parcel',
        expect.objectContaining({
          multiSelect: true
        })
      )
    })
  })

  describe('handlePost — validation', () => {
    it('re-renders with error when no parcels submitted (single-select)', async () => {
      const controller = makeController()
      const h = makeH()

      await controller.handlePost(makeRequest({}), makeContext(), h)

      expect(h.view).toHaveBeenCalledWith(
        'map-select-parcel',
        expect.objectContaining({
          errors: 'Select a land parcel on the map to continue'
        })
      )
      expect(controller.setState).not.toHaveBeenCalled()
    })

    it('re-renders with multi-select error message when no parcels submitted', async () => {
      const controller = makeController({ multiSelect: true })
      const h = makeH()

      await controller.handlePost(makeRequest({}), makeContext(), h)

      expect(h.view).toHaveBeenCalledWith(
        'map-select-parcel',
        expect.objectContaining({
          errors: 'Select at least one land parcel on the map to continue'
        })
      )
    })

    it('re-renders when landParcels is empty string', async () => {
      const controller = makeController()
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: '' }), makeContext(), h)

      expect(h.view).toHaveBeenCalled()
      expect(controller.setState).not.toHaveBeenCalled()
    })
  })

  describe('handlePost — single-select success', () => {
    it('saves selectedParcelId, selectedParcelIds, selectedParcelsDisplay to state', async () => {
      const controller = makeController()
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          selectedParcelId: 'SD7148-9160',
          selectedParcelIds: ['SD7148-9160'],
          selectedParcelsDisplay: 'SD7148-9160'
        })
      )
    })

    it('appends ?parcelId to the redirect URL', async () => {
      const controller = makeController()
      controller.getNextPath = vi.fn().mockReturnValue('/next')
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD7148-9160' }), makeContext(), h)

      expect(controller.proceed).toHaveBeenCalledWith(expect.anything(), h, '/next?parcelId=SD7148-9160')
    })

    it('URL-encodes the parcel ID in the redirect', async () => {
      const controller = makeController()
      controller.getNextPath = vi.fn().mockReturnValue('/next')
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: 'SD 71/48' }), makeContext(), h)

      expect(controller.proceed).toHaveBeenCalledWith(expect.anything(), h, '/next?parcelId=SD%2071%2F48')
    })

    it('handles array payload with one item', async () => {
      const controller = makeController()
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: ['SD7148-9160'] }), makeContext(), h)

      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ selectedParcelId: 'SD7148-9160' })
      )
    })
  })

  describe('handlePost — multi-select success', () => {
    it('saves selectedParcelIds and selectedParcelsDisplay, no selectedParcelId', async () => {
      const controller = makeController({ multiSelect: true })
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: ['SD7148-9160', 'SD7148-9161'] }), makeContext(), h)

      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          selectedParcelIds: ['SD7148-9160', 'SD7148-9161'],
          selectedParcelsDisplay: 'SD7148-9160, SD7148-9161'
        })
      )
      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ selectedParcelId: expect.anything() })
      )
    })

    it('does not append parcelId to redirect URL', async () => {
      const controller = makeController({ multiSelect: true })
      controller.getNextPath = vi.fn().mockReturnValue('/next')
      const h = makeH()

      await controller.handlePost(makeRequest({ landParcels: ['SD7148-9160', 'SD7148-9161'] }), makeContext(), h)

      expect(controller.proceed).toHaveBeenCalledWith(expect.anything(), h, '/next')
    })

    it('filters non-string values from array payload', async () => {
      const controller = makeController({ multiSelect: true })
      const h = makeH()

      await controller.handlePost(
        makeRequest({ landParcels: ['SD7148-9160', 123, null, 'SD7148-9161'] }),
        makeContext(),
        h
      )

      expect(controller.setState).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          selectedParcelIds: ['SD7148-9160', 'SD7148-9161']
        })
      )
    })
  })
})
