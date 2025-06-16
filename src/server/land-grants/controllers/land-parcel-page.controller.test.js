import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { fetchParcels } from '~/src/server/land-grants/services/land-grants.service.js'
import LandParcelPageController from './land-parcel-page.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')

jest.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  fetchParcels: jest.fn()
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
  const landParcel = { landParcel: 'sheet123' }

  const setupRequest = () => ({
    query: {},
    logger: { error: jest.fn() }
  })

  const setupContext = (state = {}) => ({ state })

  const setupH = () => ({
    view: jest.fn().mockReturnValue(renderedViewMock),
    redirect: jest.fn().mockReturnValue('redirected')
  })

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Select Land Parcel'
    })

    controller = new LandParcelPageController()
    controller.proceed = jest.fn().mockResolvedValue('next')
    controller.getNextPath = jest.fn().mockReturnValue('/next-page')
    controller.setState = jest.fn()

    fetchParcels.mockResolvedValue(mockParcelsResponse)

    mockRequest = setupRequest()
    mockContext = setupContext({
      sbi: 117235001,
      customerReference: 1100598138
    })
    mockH = setupH()
  })

  afterEach(jest.clearAllMocks)

  it('should have the correct viewName', () => {
    expect(controller.viewName).toBe('select-land-parcel')
  })

  describe('GET route handler', () => {
    it('gets parcels info and renders view', async () => {
      const result = await controller.makeGetRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(fetchParcels).toHaveBeenCalledWith(106284736)
      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel',
          parcels: controllerParcelsResponse,
          landParcel: ''
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it('handles missing parcels info', async () => {
      fetchParcels.mockRejectedValue(new Error('not found'))

      const result = await controller.makeGetRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

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

      const result = await controller.makeGetRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          landParcel: '',
          parcels: controllerParcelsResponse
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it('populates full viewModel correctly', async () => {
      mockContext.state.landParcel = landParcel.landParcel

      const result = await controller.makeGetRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(mockH.view).toHaveBeenCalledWith(
        'select-land-parcel',
        expect.objectContaining({
          landParcel: 'sheet123',
          parcels: controllerParcelsResponse,
          pageTitle: 'Select Land Parcel'
        })
      )
      expect(result).toBe(renderedViewMock)
    })
  })

  describe('POST route handler', () => {
    it('saves landParcel and proceeds', async () => {
      mockRequest.payload = landParcel
      mockContext = setupContext({ existing: 'value' })

      const result = await controller.makePostRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        existing: 'value',
        landParcel: landParcel.landParcel
      })
      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/next-page'
      )
      expect(result).toBe('next')
    })

    it('sets an error if landParcel is not defined', async () => {
      mockRequest.payload = { action: 'validate' }
      mockContext = setupContext({ existing: 'value' })

      const result = await controller.makePostRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

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

    it('handles missing landParcel in payload', async () => {
      mockRequest.payload = {}
      mockContext = setupContext({ foo: 'bar' })

      const result = await controller.makePostRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        foo: 'bar',
        landParcel: undefined
      })
      expect(controller.proceed).toHaveBeenCalled()
      expect(result).toBe('next')
    })

    it('handles null payload', async () => {
      mockRequest.payload = null
      mockContext = setupContext({})

      const result = await controller.makePostRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        landParcel: undefined
      })
      expect(controller.proceed).toHaveBeenCalled()
      expect(result).toBe('next')
    })
  })
})
