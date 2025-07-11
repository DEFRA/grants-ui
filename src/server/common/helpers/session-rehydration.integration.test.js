import { sbiSelectorController } from '~/src/server/sbi/sbi.controller.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import { performSessionHydration } from '~/src/server/index.js'

jest.mock('~/src/server/sbi/state.js', () => ({
  sbiStore: {
    set: jest.fn(),
    get: jest.fn()
  }
}))

jest.mock('~/src/server/index.js', () => ({
  ...jest.requireActual('~/src/server/index.js'),
  performSessionHydration: jest.fn(),
  clearCachedKey: jest.fn()
}))

describe('Session Rehydration Integration', () => {
  let mockRequest
  let mockH

  const mockSbi = '123456789'

  beforeEach(() => {
    jest.clearAllMocks()

    mockH = {
      response: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis()
    }

    mockRequest = {
      method: 'post',
      payload: { sbi: mockSbi },
      logger: {
        info: jest.fn(),
        error: jest.fn()
      },
      server: {
        logger: {
          info: jest.fn(),
          error: jest.fn()
        }
      }
    }

    sbiStore.get.mockReturnValue(mockSbi)
  })

  it('should successfully rehydrate session from backend', async () => {
    const mockSessionData = {
      applicationData: { businessName: 'Test Business' }
    }

    performSessionHydration.mockResolvedValueOnce(mockSessionData)

    const result = await sbiSelectorController.handler(mockRequest, mockH)

    expect(sbiStore.set).toHaveBeenCalledWith('sbi', mockSbi)
    expect(performSessionHydration).toHaveBeenCalledWith(mockRequest.server, mockSbi)
    expect(mockRequest.logger.info).toHaveBeenCalledWith(`Session hydration completed for SBI: ${mockSbi}`)
    expect(mockH.response).toHaveBeenCalledWith({
      message: 'SBI updated successfully'
    })
    expect(result).toBe(mockH)
  })

  it('should handle backend API failures gracefully', async () => {
    performSessionHydration.mockRejectedValueOnce(new Error('Network error'))

    const result = await sbiSelectorController.handler(mockRequest, mockH)

    expect(sbiStore.set).toHaveBeenCalledWith('sbi', mockSbi)
    expect(performSessionHydration).toHaveBeenCalledWith(mockRequest.server, mockSbi)
    expect(mockRequest.logger.error).toHaveBeenCalledWith(
      `Session hydration failed for SBI: ${mockSbi}`,
      expect.any(Error)
    )
    expect(mockH.response).toHaveBeenCalledWith({
      message: 'SBI updated successfully'
    })
    expect(result).toBe(mockH)
  })
})
