import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { vi } from 'vitest'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import { fetchParcels } from '~/src/server/land-grants/services/land-grants.service.js'
import SelectLandParcelPageController from './select-land-parcel-page.controller.js'

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  fetchParcels: vi.fn()
}))

vi.mock('~/src/server/land-grants/utils/format-parcel.js', () => ({
  stringifyParcel: ({ parcelId, sheetId }) => `${sheetId}-${parcelId}`
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

describe('SelectLandParcelPageController', () => {
  let controller
  let mockRequest
  let mockResponseWithCode
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
        sbi: '106284736',
        crn: '1102838829',
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
    response: vi.fn().mockReturnValue(mockResponseWithCode)
  })

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'Select Land Parcel'
    })

    controller = new SelectLandParcelPageController()
    controller.proceed = vi.fn().mockResolvedValue('next')
    controller.getNextPath = vi.fn().mockReturnValue('/next-page')
    controller.setState = vi.fn()
    controller.performAuthCheck = vi.fn().mockResolvedValue(null)

    fetchParcels.mockResolvedValue(mockParcelsResponse)

    mockRequest = setupRequest()
    mockContext = setupContext({
      sbi: 117235001,
      customerReference: 1100598138
    })

    mockResponseWithCode = {
      code: vi.fn().mockReturnValue('final-response')
    }

    mockH = setupH()
  })

  afterEach(vi.clearAllMocks)

  it('should have the correct viewName', () => {
    expect(controller.viewName).toBe('select-land-parcel')
  })

  describe('formatParcelForView', () => {
    it('formats parcel with area only', () => {
      const parcel = {
        parcelId: '0155',
        sheetId: 'SD7946',
        area: { unit: 'ha', value: 4.0383 }
      }

      const result = controller.formatParcelForView(parcel, 0)

      expect(result).toEqual({
        text: 'SD7946 0155',
        value: 'SD7946-0155',
        hint: 'Total size: 4.0383 ha'
      })
    })

    it('formats parcel with area and actions', () => {
      const parcel = {
        parcelId: '0155',
        sheetId: 'SD7946',
        area: { unit: 'ha', value: 4.0383 }
      }

      const result = controller.formatParcelForView(parcel, 2)

      expect(result).toEqual({
        text: 'SD7946 0155',
        value: 'SD7946-0155',
        hint: 'Total size 4.0383 ha, 2 actions added'
      })
    })

    it('formats parcel with single action', () => {
      const parcel = {
        parcelId: '0155',
        sheetId: 'SD7946',
        area: { unit: 'ha', value: 4.0383 }
      }

      const result = controller.formatParcelForView(parcel, 1)

      expect(result).toEqual({
        text: 'SD7946 0155',
        value: 'SD7946-0155',
        hint: 'Total size 4.0383 ha, 1 action added'
      })
    })

    it('formats parcel with actions only (no area)', () => {
      const parcel = {
        parcelId: '0155',
        sheetId: 'SD7946',
        area: { unit: null, value: null }
      }

      const result = controller.formatParcelForView(parcel, 3)

      expect(result).toEqual({
        text: 'SD7946 0155',
        value: 'SD7946-0155',
        hint: '3 actions added'
      })
    })

    it('formats parcel with no area and no actions', () => {
      const parcel = {
        parcelId: '0155',
        sheetId: 'SD7946',
        area: { unit: null, value: null }
      }

      const result = controller.formatParcelForView(parcel, 0)

      expect(result).toEqual({
        text: 'SD7946 0155',
        value: 'SD7946-0155',
        hint: ''
      })
    })
  })

  describe('GET route handler', () => {
    it('gets parcels info and renders view', async () => {
      const result = await controller.makeGetRouteHandler()(mockRequest, mockContext, mockH)

      expect(fetchParcels).toHaveBeenCalledWith(mockRequest)
      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel',
          parcels: controllerParcelsResponse,
          selectedLandParcel: null
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
          errors: ['Unable to find parcel information, please try again later or contact the Rural Payments Agency.']
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
          existingLandParcels: false,
          pageTitle: 'Select Land Parcel',
          parcels: controllerParcelsResponse,
          selectedLandParcel: null
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
          existingLandParcels: false,
          parcels: controllerParcelsResponse,
          pageTitle: 'Select Land Parcel',
          selectedLandParcel: null
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

      expect(controller.performAuthCheck).toHaveBeenCalledWith(mockRequest, mockH, state.selectedLandParcel)
      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        existing: 'value',
        selectedLandParcel: state.selectedLandParcel
      })
      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/next-page')
      expect(result).toBe('next')
    })

    describe('when the user does not own the land parcel', () => {
      it('should return unauthorized response when user does not own the selected land parcel', async () => {
        mockRequest.payload = state
        mockContext = setupContext({ existing: 'value' })
        controller.performAuthCheck.mockResolvedValue('failed auth check')

        const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

        expect(result).toEqual('failed auth check')
      })
    })

    it('sets an error if selectedLandParcel is not defined', async () => {
      mockRequest.payload = { action: 'validate' }
      mockContext = setupContext({ existing: 'value' })

      const result = await controller.makePostRouteHandler()(mockRequest, mockContext, mockH)

      expect(controller.setState).not.toHaveBeenCalled()
      expect(controller.proceed).not.toHaveBeenCalled()
      expect(controller.performAuthCheck).not.toHaveBeenCalled()
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
