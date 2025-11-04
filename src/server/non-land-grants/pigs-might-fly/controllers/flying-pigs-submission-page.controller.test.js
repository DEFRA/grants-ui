import { vi } from 'vitest'
import FlyingPigsSubmissionPageController from '~/src/server/non-land-grants/pigs-might-fly/controllers/flying-pigs-submission-page.controller.js'
import { stateToPigsMightFlyGasAnswers } from '~/src/server/non-land-grants/pigs-might-fly/mappers/state-to-gas-pigs-mapper.js'
import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'

vi.mock('~/src/server/non-land-grants/pigs-might-fly/mappers/state-to-gas-pigs-mapper.js')
vi.mock('~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js')
vi.mock('~/src/server/common/services/grant-application/grant-application.service.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js')

describe('FlyingPigsSubmissionPageController', () => {
  let controller
  let mockModel
  let mockPageDef
  let mockContext

  beforeEach(() => {
    mockModel = {
      def: { metadata: { submission: { grantCode: 'pigs-might-fly' } } }
    }

    mockPageDef = { title: 'Test Page', path: '/test-path' }
    controller = new FlyingPigsSubmissionPageController(mockModel, mockPageDef)

    mockContext = {
      referenceNumber: '123456',
      state: {
        sbi: 'test-sbi',
        crn: 'test-crn',
        defraId: 'test-defraId',
        frn: 'test-frn',
        isPigFarmer: true,
        totalPigs: 100,
        pigBreeds: ['largeWhite', 'britishLandrace'],
        whitePigsCount: 10,
        britishLandracePigsCount: 15
      }
    }
  })

  it('should initialize with the correct grant code and view name', () => {
    expect(controller.grantCode).toBe('pigs-might-fly')
    expect(controller.viewName).toBe('submission')
  })

  it('should transform state and submit the application', async () => {
    const mockApplicationData = { metadata: {}, answers: {} }
    stateToPigsMightFlyGasAnswers.mockReturnValue(mockContext.state)
    transformStateObjectToGasApplication.mockReturnValue(mockApplicationData)

    await controller.submitPigTypesApplication(mockContext)

    expect(transformStateObjectToGasApplication).toHaveBeenCalledWith(
      {
        sbi: 'test-sbi',
        frn: 'test-frn',
        crn: 'test-crn',
        defraId: 'test-defraId',
        clientRef: '123456'
      },
      mockContext.state,
      stateToPigsMightFlyGasAnswers
    )
    expect(submitGrantApplication).toHaveBeenCalledWith('pigs-might-fly', mockApplicationData)
  })

  it('should handle POST route and redirect to /confirmation', async () => {
    const mockRequest = {
      logger: mockRequestLogger(),
      server: {}
    }
    const mockResponseToolkit = { redirect: vi.fn() }
    const mockCacheService = { setConfirmationState: vi.fn() }

    getFormsCacheService.mockReturnValue(mockCacheService)

    const postHandler = controller.makePostRouteHandler()
    await postHandler(mockRequest, mockContext, mockResponseToolkit)

    expect(mockCacheService.setConfirmationState).toHaveBeenCalledWith(mockRequest, {
      ...mockContext.state,
      $$__referenceNumber: '123456',
      confirmed: true
    })
    expect(mockResponseToolkit.redirect).toHaveBeenCalledWith('/confirmation')
  })
})
