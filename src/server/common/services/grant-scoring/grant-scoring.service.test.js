import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mockFetch } from '~/src/__mocks__/hapi-mocks.js'
import { config } from '~/src/config/config.js'
import { invokeGrantScoringGetAction, makeScoringApiRequest } from './grant-scoring.service.js'
import { GrantScoringServiceError } from '~/src/server/common/utils/errors/GrantScoringServiceError.js'

global.fetch = mockFetch

vi.mock('~/src/server/common/helpers/auth/scoring-service-token.js', () => ({
  getScoringServiceToken: vi.fn().mockResolvedValue('mock-token')
}))

vi.mock('~/src/server/common/helpers/retry.js', () => ({
  retry: vi.fn((operation) => operation())
}))

vi.mock('@defra/hapi-tracing', () => ({
  withTraceId: vi.fn((header, headers) => ({ ...headers, [header]: 'mock-trace-id' }))
}))

describe('Grant Scoring service', () => {
  const scoringApi = 'http://localhost:3002'
  const code = 'water-management'
  const jsonHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer mock-token',
    'x-trace-id': 'mock-trace-id'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(config, 'get').mockImplementation((path) => {
      if (path === 'scoring.serviceUrl') {
        return scoringApi
      }
      if (path === 'tracing.header') {
        return 'x-trace-id'
      }
      return undefined
    })
  })

  describe('invokeGrantScoringGetAction', () => {
    test('should successfully invoke a scoring GET action without query params', async () => {
      const mockResponse = { score: 75, band: 'High' }
      const mockedFetch = mockFetch()
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockResponse)
      })

      const endpoint = 'scoring/water-management'
      const result = await invokeGrantScoringGetAction(endpoint, code)

      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${endpoint}`),
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

      const endpoint = 'scoring/water-management'
      const queryParams = { county: 'BERKSHIRE' }
      const result = await invokeGrantScoringGetAction(endpoint, code, queryParams)

      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${endpoint}?county=BERKSHIRE`),
        expect.objectContaining({
          method: 'GET',
          headers: jsonHeaders
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe('makeScoringApiRequest', () => {
    test('should throw a GrantScoringServiceError when the request fails (non-ok response)', async () => {
      const mockedFetch = mockFetch()
      const mockMessage = 'Internal Server Error'

      mockedFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ message: mockMessage })
      })

      const url = `${scoringApi}/scoring/${code}`
      try {
        await makeScoringApiRequest(url, code)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(GrantScoringServiceError)
        expect(error.message).toContain('500 Internal Server Error - Internal Server Error')
      }
    })

    test('should throw GrantScoringServiceError with upstreamStatus when request fails', async () => {
      const mockedFetch = mockFetch()
      mockedFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ message: 'Resource not found' })
      })

      const url = `${scoringApi}/scoring/${code}`
      try {
        await makeScoringApiRequest(url, code)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(GrantScoringServiceError)
        expect(error.details.upstreamStatus).toBe(404)
        expect(error.message).toContain('404 Not Found - Resource not found')
      }
    })

    test('should handle error response without message', async () => {
      const mockedFetch = mockFetch()
      mockedFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({})
      })

      const url = `${scoringApi}/scoring/${code}`
      try {
        await makeScoringApiRequest(url, code)
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error.message).toBe('400 Bad Request')
      }
    })

    test('should handle network errors and wrap them in GrantScoringServiceError', async () => {
      const mockedFetch = mockFetch()
      const networkError = new Error('Network error')
      mockedFetch.mockRejectedValue(networkError)

      const url = `${scoringApi}/scoring/${code}`
      await expect(makeScoringApiRequest(url, code)).rejects.toThrow(GrantScoringServiceError)
      await expect(makeScoringApiRequest(url, code)).rejects.toThrow('Failed to get grant eligibility score result')
    })

    test('should use default GET method if none provided', async () => {
      const mockedFetch = mockFetch()
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({})
      })

      const url = `${scoringApi}/scoring/${code}`
      await makeScoringApiRequest(url, code)

      expect(mockedFetch).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'GET' }))
    })

    test('should handle missing queryParams in options', async () => {
      const mockedFetch = mockFetch()
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({})
      })

      const url = `${scoringApi}/scoring/${code}`
      await makeScoringApiRequest(url, code, {})

      expect(mockedFetch).toHaveBeenCalledWith(url, expect.anything())
    })

    test('should skip undefined or null query parameters', async () => {
      const mockedFetch = mockFetch()
      mockedFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({})
      })

      const url = `${scoringApi}/scoring/${code}`
      await makeScoringApiRequest(url, code, {
        queryParams: {
          valid: 'yes',
          invalid: undefined,
          nulled: null
        }
      })

      expect(mockedFetch).toHaveBeenCalledWith(`${url}?valid=yes`, expect.anything())
    })
  })
})
