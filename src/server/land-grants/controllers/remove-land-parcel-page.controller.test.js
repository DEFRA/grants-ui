import { beforeEach, describe, expect, test, vi } from 'vitest'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
import RemoveLandParcelPageController from './remove-land-parcel-page.controller.js'

describe('RemoveLandParcelPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const mockLandParcels = {
    'SO3757-3192': {
      actionsObj: {
        GRH8: { description: 'Haymaking supplement (late cut): GRH8', value: '78.56', unit: 'ha' }
      }
    },
    'SD6944-0085': {
      actionsObj: {
        CMOR1: { description: 'Assess moorland and produce a written record: CMOR1', value: '1.0', unit: 'ha' }
      }
    }
  }

  const buildController = (config = {}) => {
    const mockModel = {
      def: { metadata: { tasklist: {}, pageConfig: { '/remove-land-parcel': config } } },
      getSection: vi.fn()
    }
    const instance = new RemoveLandParcelPageController(mockModel, { path: '/remove-land-parcel' })
    setupControllerMocks(instance)
    instance.getViewModel = vi
      .fn()
      .mockReturnValue({ pageTitle: 'Remove this land parcel?', serviceUrl: '/grasslands' })
    instance.getHref = vi.fn().mockImplementation((path) => `/grasslands${path}`)
    return instance
  }

  beforeEach(() => {
    controller = buildController({
      redirects: { list: '/your-land-and-actions', noParcelsRemain: '/your-land-and-actions' }
    })

    mockRequest = {
      query: { parcelId: 'SO3757-3192' },
      payload: {}
    }

    mockContext = { state: { landParcels: structuredClone(mockLandParcels) } }

    mockH = { view: vi.fn().mockReturnValue('view rendered'), redirect: vi.fn() }
  })

  describe('handleGet', () => {
    test('renders the confirmation view with the parcel reference, cancel link and back link', async () => {
      const result = await controller.handleGet(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'remove-land-parcel',
        expect.objectContaining({
          parcelId: 'SO3757-3192',
          parcelReference: 'SO3757 3192',
          cancelPath: '/grasslands/your-land-and-actions',
          backLink: { text: 'Back', href: '/grasslands/your-land-and-actions' }
        })
      )
      expect(result).toBe('view rendered')
    })

    test.each([
      ['no parcelId is given', {}],
      ['the parcelId is blank', { parcelId: '' }],
      ['the parcel is not in state', { parcelId: 'ZZ0000-0000' }]
    ])('redirects to the list page when %s', async (_name, query) => {
      mockRequest.query = query

      await controller.handleGet(mockRequest, mockContext, mockH)

      expect(mockH.view).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/your-land-and-actions')
    })
  })

  describe('handlePost', () => {
    test('removes the parcel and returns to the list', async () => {
      await controller.handlePost(mockRequest, mockContext, mockH)

      const [, newState] = controller.setState.mock.calls[0]
      expect(newState.landParcels).not.toHaveProperty('SO3757-3192')
      expect(newState.landParcels).toHaveProperty('SD6944-0085')
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/your-land-and-actions')
    })

    test('returns to the list page when the last parcel is removed', async () => {
      mockContext.state = { landParcels: { 'SO3757-3192': structuredClone(mockLandParcels['SO3757-3192']) } }

      await controller.handlePost(mockRequest, mockContext, mockH)

      const [, newState] = controller.setState.mock.calls[0]
      expect(newState).not.toHaveProperty('landParcels')
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/your-land-and-actions')
    })

    test('does not remove anything when the parcel is not in state', async () => {
      mockRequest.query = { parcelId: 'ZZ0000-0000' }

      await controller.handlePost(mockRequest, mockContext, mockH)

      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/your-land-and-actions')
    })
  })

  describe('redirect defaults', () => {
    test('falls back to the farm payments paths when no config is given', async () => {
      const defaulted = buildController()
      mockRequest.query = {}

      await defaulted.handleGet(mockRequest, mockContext, mockH)

      expect(defaulted.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
    })
  })
})
