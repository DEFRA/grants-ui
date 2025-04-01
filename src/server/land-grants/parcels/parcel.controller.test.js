import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { fetchParcelDataForBusiness } from '~/src/server/common/services/consolidated-view.service.js'
import LandParcelController from './parcel.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')

jest.mock('~/src/server/common/services/consolidated-view.service.js', () => ({
  fetchParcelDataForBusiness: jest.fn()
}))

describe('LandParcelController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const fetchParcelDataForBusinessMock = {
    data: { business: { name: 'Mock Farm' } }
  }
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

    controller = new LandParcelController()
    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }
    controller.proceed = jest.fn().mockResolvedValue('next')
    controller.getNextPath = jest.fn().mockReturnValue('/next-page')
    controller.setState = jest.fn()

    fetchParcelDataForBusiness.mockResolvedValue({
      data: {
        name: 'Test Farm',
        address: '123 Farm Road',
        parcels: [
          { id: 'parcel1', name: 'Field 1', area: 10 },
          { id: 'parcel2', name: 'Field 2', area: 20 }
        ]
      }
    })

    mockRequest = setupRequest()
    mockContext = setupContext({
      sbi: 117235001,
      customerReference: 1100598138
    })
    mockH = setupH()
  })

  afterEach(jest.clearAllMocks)

  it('should have the correct viewName', () => {
    expect(controller.viewName).toBe('parcel')
  })

  describe('GET route handler', () => {
    it('fetches business info and renders view', async () => {
      const result = await controller.makeGetRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(fetchParcelDataForBusiness).toHaveBeenCalledWith(
        117235001,
        1100598138
      )
      expect(mockH.view).toHaveBeenCalledWith(
        'parcel',
        expect.objectContaining({ pageTitle: 'Select Land Parcel' })
      )
      expect(result).toBe(renderedViewMock)
    })

    it('handles missing business info', async () => {
      fetchParcelDataForBusiness.mockRejectedValue(new Error('not found'))

      const handler = controller.makeGetRouteHandler()
      await expect(
        handler(mockRequest, mockContext, mockH)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('defaults state fields when context.state is undefined', async () => {
      mockContext.state = undefined

      fetchParcelDataForBusiness.mockResolvedValue(
        fetchParcelDataForBusinessMock
      )

      const result = await controller.makeGetRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(mockH.view).toHaveBeenCalledWith(
        'parcel',
        expect.objectContaining({
          landParcel: '',
          actions: '',
          business: { name: 'Mock Farm' }
        })
      )
      expect(result).toBe(renderedViewMock)
    })

    it('populates full viewModel correctly', async () => {
      mockContext.state.landParcel = landParcel.landParcel
      mockContext.state.actions = ['a1', 'a2']
      controller.collection.getErrors.mockReturnValue(['mock error'])

      fetchParcelDataForBusiness.mockResolvedValue(
        fetchParcelDataForBusinessMock
      )

      const result = await controller.makeGetRouteHandler()(
        mockRequest,
        mockContext,
        mockH
      )

      expect(controller.collection.getErrors).toHaveBeenCalledTimes(2)
      expect(mockH.view).toHaveBeenCalledWith('parcel', {
        ...landParcel,
        actions: 'a1,a2',
        business: { name: 'Mock Farm' },
        errors: ['mock error'],
        proxyUrl: '',
        pageTitle: 'Select Land Parcel'
      })
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
      expect(result).toBe('next')
    })
  })
})
