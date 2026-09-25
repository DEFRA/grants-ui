import { beforeEach, vi } from 'vitest'
import { mockFetch, mockSimpleRequest } from '~/src/__mocks__/hapi-mocks.js'
import { config } from '~/src/config/config.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { invokeGrantScoringGetAction, makeScoringApiRequest } from './grant-scoring.service.js'

global.fetch = mockFetch

vi.mock('~/src/server/common/helpers/auth/scoring-service-token.js', () => ({
  getScoringServiceToken: vi.fn().mockResolvedValue('mock-token')
}))

describe('Grant Scoring service', () => {
  let mockRequest
  const scoringApi = config.get('scoring.serviceUrl')
  const code = 'water-management'
  const jsonHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer mock-token'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRequest = mockSimpleRequest()
    mockRequest.sts = {}
    vi.spyOn(config, 'get').mockImplementation((path) => {
      if (path === 'scoring.serviceUrl') {
        return 'http://localhost:3002'
      }
      if (path === 'tracing.header') {
        return 'x-trace-id'
      }
      return undefined
    })
  })

  test('should successfully invoke a scoring GET action without query params', async () => {
    const mockResponse = { score: 75, band: 'High' }
    const mockedFetch = mockFetch()
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockResponse)
    })

    const result = await invokeGrantScoringGetAction(code, mockRequest)

    expect(mockedFetch).toHaveBeenCalledWith(
      `${scoringApi}/scoring/${code}`,
      expect.objectContaining({
        method: 'GET',
        headers: jsonHeaders
      })
    )
    expect(result).toEqual(mockResponse)
  })

  test('should successfully invoke a scoring GET action with query params', async () => {
    const mockResponse = { score: 50, band: 'Average' }
    const mockedFetch = mockFetch()
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce(mockResponse)
    })

    const queryParams = { county: 'BERKSHIRE' }
    const result = await invokeGrantScoringGetAction(code, mockRequest, queryParams)

    expect(mockedFetch).toHaveBeenCalledWith(
      `${scoringApi}/scoring/${code}?county=BERKSHIRE`,
      expect.objectContaining({
        method: 'GET',
        headers: jsonHeaders
      })
    )
    expect(result).toEqual(mockResponse)
  })

  test('should throw a GrantScoringServiceApiError when the request fails', async () => {
    const mockedFetch = mockFetch()
    const mockMessage = 'Internal Server Error'

    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => ({ message: mockMessage })
    })

    await expect(invokeGrantScoringGetAction(code, mockRequest)).rejects.toThrow(mockMessage)

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error' }),
      expect.objectContaining({
        service: 'grant-scoring-service',
        upstreamStatus: 500
      }),
      mockRequest
    )
  })

  test('should handle network errors', async () => {
    const mockedFetch = mockFetch()
    const networkError = new Error('Network error')
    mockedFetch.mockRejectedValue(networkError)

    await expect(invokeGrantScoringGetAction(code, mockRequest)).rejects.toThrow('Network error')
  })

  test('should return base URL if queryParams is not provided', async () => {
    const mockedFetch = mockFetch()
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({})
    })

    const url = 'http://localhost:3002/scoring/water-management'
    await makeScoringApiRequest(url, code, mockRequest, { queryParams: undefined })

    expect(mockedFetch).toHaveBeenCalledWith(url, expect.anything())
  })

  test('should return base URL if queryParams is empty', async () => {
    const mockedFetch = mockFetch()
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValueOnce({})
    })

    const url = 'http://localhost:3002/scoring/water-management'
    await makeScoringApiRequest(url, code, mockRequest, { queryParams: {} })

    expect(mockedFetch).toHaveBeenCalledWith(url, expect.anything())
  })
})
