import { vi } from 'vitest'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { fetchParcels } from '~/src/server/land-grants/services/land-grants.service.js'
import LandParcelPageController from './land-parcel-page.controller.js'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  fetchParcels: vi.fn()
}))

const mockParcelsResponse = [
  {
    parcelId: '0155',
    sheetId: 'SD7946',
    area: { unit: 'ha', value: 4.0383 }
  },
  {
    parcelId: '4509',
    sheetId: 'SD7846',
    area: { unit: 'sqm', value: 0.0633 }
  }
]

const controllerParcelsResponse = [
  {
    value: 'SD7946-0155',
    text: 'SD7946 0155',
    hint: 'Total size: 4.0383 ha'
  },
  {
    value: 'SD7846-4509',
    text: 'SD7846 4509',
    hint: 'Total size: 0.0633 sqm'
  }
]

describe('LandParcelPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const renderedViewMock = 'mock-rendered-view'
  const state = { selectedLandParcel: 'sheet123' }

  const setupRequest = () => ({
    query: {},
    logger: mockRequestLogger(),
    auth: {
      isAuthenticated: true,
      credentials: {
        sbi: '123456789',
        name: 'John Doe',
        organisationId: 'org123',
        organisationName: ' Farm 1',
        role: 'admin',
        sessionId: 'valid-session-id'
      }
    }
  })

  const setupContext = (state = {}) => ({ state })

  const setupH = () => ({
    view: vi.fn().mockReturnValue(renderedViewMock),
    redirect: vi.fn().mockReturnValue('redirected')
  })

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Select Land Parcel'
    })

    controller = new LandParcelPageController()
    controller.proceed = vi.fn().mockResolvedValue('next')
    controller.getNextPath = vi.fn().mockReturnValue('/next-page')
    controller.setState = vi.fn()

    fetchParcels.mockResolvedValue(mockParcelsResponse)

    mockRequest = setupRequest()
    mockContext = setupContext({
      sbi: 117235001,
      customerReference: 1100598138
    })
    mockH = setupH()
  })

  afterEach(vi.clearAllMocks)

  it('should have the correct viewName', () => {
    expect(controller.viewName).toBe('select-land-parcel')
  })

  describe('GET route handler', () => {
    it('gets parcels info and renders view', async () => {
      const result = await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(fetchParcels).toHaveBeenCalledWith('123456789')
      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel',
          parcels: controllerParcelsResponse,
          selectedLandParcel: ''
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it('handles missing parcels info', async () => {
      fetchParcels.mockRejectedValue(new Error('not found'))

      const result = await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel',
          errors: ['Unable to find parcel information, please try again later.']
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it('defaults state fields when context.state is undefined', async () => {
      mockContext.state = undefined

      const result = await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          selectedLandParcel: '',
          parcels: controllerParcelsResponse
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it('populates full viewModel correctly', async () => {
      mockContext.state.selectedLandParcel = state.selectedLandParcel

      const result = await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          selectedLandParcel: 'sheet123',
          parcels: controllerParcelsResponse,
          pageTitle: 'Select Land Parcel'
        })
      )
      expect(result).toBe(renderedViewMock)
    })
  })

  describe('POST route handler', () => {
    it('saves selectedLandParcel and proceeds', async () => {
      mockRequest.payload = state
      mockContext = setupContext({ existing: 'value' })

      const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        existing: 'value',
        selectedLandParcel: state.selectedLandParcel
      })
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-page')
      expect(result).toBe('next')
    })

    it('sets an error if selectedLandParcel is not defined', async () => {
      mockRequest.payload = { action: 'validate' }
      mockContext = setupContext({ existing: 'value' })

      const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).not.toHaveBeenCalled()
      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel',
          errorMessage: 'Please select a land parcel from the list'
        })
      )
      expect(result).toBe('mock-rendered-view')
    })

    it('handles missing selectedLandParcel in payload', async () => {
      mockRequest.payload = {}
      mockContext = setupContext({})

      const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        selectedLandParcel: undefined
      })
      expect(controller.proceed).toHaveBeenCalled()
      expect(result).toBe('next')
    })

    it('handles null payload', async () => {
      mockRequest.payload = null
      mockContext = setupContext({})

      const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        selectedLandParcel: undefined
      })
      expect(controller.proceed).toHaveBeenCalled()
      expect(result).toBe('next')
    })
  })
})
