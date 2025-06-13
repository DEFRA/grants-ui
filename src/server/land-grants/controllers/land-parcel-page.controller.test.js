import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { fetchParcelsForSbi } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import LandParcelPageController from './land-parcel-page.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')
jest.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: jest.fn().mockReturnValue({
    error: jest.fn()
  })
}))

jest.mock(
  '~/src/server/common/services/consolidated-view/consolidated-view.service.js',
  () => ({
    fetchParcelsForSbi: jest.fn()
  })
)

const mockParcelsResponse = [
  {
    parcelId: '0155',
    sheetId: 'SD7946',
    area: 4.0383
  },
  {
    parcelId: '4509',
    sheetId: 'SD7846',
    area: 0.0633
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

    fetchParcelsForSbi.mockResolvedValue(mockParcelsResponse)

    mockRequest = setupRequest()
    mockContext = setupContext({
      sbi: 117235001,
      customerReference: 1100598138
    })
    mockH = setupH()
  })

  afterEach(jest.clearAllMocks)

  it('should have the correct viewName', () => {
    expect(controller.viewName).toBe('land-parcel')
  })

  describe('GET route handler', () => {
    it('fetches parcels list and renders view', async () => {
      const result = await controller.makeGetRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(fetchParcelsForSbi).toHaveBeenCalledWith(106284736)
      expect(mockH.view).toHaveBeenCalledWith(
        'land-parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel',
          parcels: mockParcelsResponse,
          landParcel: ''
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it('handles missing parcels info', async () => {
      fetchParcelsForSbi.mockRejectedValue(new Error('not found'))

      const result = await controller.makeGetRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(mockH.view).toHaveBeenCalledWith(
        'land-parcel',
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
        'land-parcel',
        expect.objectContaining({
          landParcel: '',
          parcels: mockParcelsResponse
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
        'land-parcel',
        expect.objectContaining({
          landParcel: 'sheet123',
          parcels: mockParcelsResponse,
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
        'land-parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel',
          landParcelError: 'Please select a land parcel from the list'
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
