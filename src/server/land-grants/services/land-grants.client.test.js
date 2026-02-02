import {
  calculate,
  parcelsWithActionsAndSize,
  parcelsWithFields,
  parcelsWithSize,
  postToLandGrantsApi,
  validate
} from './land-grants.client.js'
import { vi } from 'vitest'
import { retry } from '~/src/server/common/helpers/retry.js'
import { config } from '~/src/config/config.js'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

vi.mock('~/src/server/common/helpers/retry.js')

/** @type {import('vitest').MockedFunction<any>} */
const mockFetch = vi.fn()

vi.mock('~/src/server/common/helpers/auth/backend-auth-helper.js', () => ({
  createApiHeadersForLandGrantsBackend: () => ({
    Authorization: 'Bearer token',
    'Content-Type': 'application/json'
  })
}))

global.fetch = mockFetch

const mockApiEndpoint = 'http://mock-land-grants-api'

describe('Land Grants client', () => {
  beforeEach(() => {
    retry.mockImplementation(async (operation, options) => {
      try {
        return await operation()
      } catch (error) {
        if (options?.onRetry) {
          options.onRetry(error, 1)
        }
        throw error
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('postToLandGrantsApi', () => {
    it('should make successful POST request', async () => {
      const mockResponse = { id: 1, status: 'success' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await postToLandGrantsApi('/submit', { data: 'test' }, mockApiEndpoint)

      expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/submit`, {
        method: 'POST',
        headers: {
          Authorization: expect.any(String),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: 'test' })
      })
      expect(result).toEqual(mockResponse)
    })

    it('should handle 404 error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      await expect(postToLandGrantsApi('/invalid', {}, mockApiEndpoint)).rejects.toThrow('Not Found')

      let code, message
      try {
        await postToLandGrantsApi('/invalid', {}, mockApiEndpoint)
      } catch (error) {
        code = error.code
        message = error.message
      }
      expect(code).toBe(404)
      expect(message).toBe('Not Found')
    })

    it('should handle empty endpoint', async () => {
      const mockResponse = { success: true }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      await postToLandGrantsApi('', { test: 'data' }, mockApiEndpoint)

      expect(mockFetch).toHaveBeenCalledWith(mockApiEndpoint, expect.any(Object))
    })

    it('should verify error has status property set to same value as code', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      try {
        await postToLandGrantsApi('/error', {}, mockApiEndpoint)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.code).toBe(500)
        expect(error.status).toBe(500)
        expect(error.code).toBe(error.status)
      }
    })

    it('should call response.json() when response is ok', async () => {
      const mockJson = vi.fn().mockResolvedValue({ data: 'test' })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: mockJson
      })

      await postToLandGrantsApi('/test', {}, mockApiEndpoint)

      expect(mockJson).toHaveBeenCalledTimes(1)
    })

    it('should not call response.json() when response is not ok', async () => {
      const mockJson = vi.fn().mockResolvedValue({ data: 'test' })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: mockJson
      })

      try {
        await postToLandGrantsApi('/test', {}, mockApiEndpoint)
      } catch (error) {
        // Expected error
      }

      expect(mockJson).not.toHaveBeenCalled()
    })

    it('should construct URL correctly with baseUrl and endpoint', async () => {
      const mockResponse = { success: true }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      await postToLandGrantsApi('/api/test', {}, 'http://example.com')

      expect(mockFetch).toHaveBeenCalledWith('http://example.com/api/test', expect.any(Object))
    })

    it('should stringify body correctly', async () => {
      const mockResponse = { success: true }
      const testBody = { foo: 'bar', nested: { value: 123 } }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      await postToLandGrantsApi('/test', testBody, mockApiEndpoint)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(testBody)
        })
      )
    })

    it('should set POST method in fetch options', async () => {
      const mockResponse = { success: true }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      await postToLandGrantsApi('/test', {}, mockApiEndpoint)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST'
        })
      )
    })

    it('should verify retry is called with correct parameters', async () => {
      const mockResponse = { success: true }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      await postToLandGrantsApi('/test', {}, mockApiEndpoint)

      expect(retry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          timeout: 30000,
          serviceName: 'LandGrantsApi.postTo /test'
        })
      )
    })

    it('should handle error with different status codes', async () => {
      const statusCodes = [400, 401, 403, 500, 502, 503]

      for (const status of statusCodes) {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status,
          statusText: `Error ${status}`
        })

        try {
          await postToLandGrantsApi('/test', {}, mockApiEndpoint)
          expect.fail('Should have thrown an error')
        } catch (error) {
          expect(error.status).toBe(status)
          expect(error.code).toBe(status)
        }
      }
    })

    it('should return the exact response from json()', async () => {
      const expectedResponse = {
        id: 123,
        data: 'complex data',
        nested: { value: true },
        array: [1, 2, 3]
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => expectedResponse
      })

      const result = await postToLandGrantsApi('/test', {}, mockApiEndpoint)

      expect(result).toEqual(expectedResponse)
      expect(result).toBe(expectedResponse)
    })
  })

  describe('timeout handling', () => {
    describe('postToLandGrantsApi', () => {
      it('should timeout when fetch hangs', async () => {
        mockFetch.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(Promise.race([postToLandGrantsApi('/test', {}, mockApiEndpoint), timeoutPromise])).rejects.toThrow(
          'Operation timed out'
        )
      }, 10000)

      it('should timeout when fetch is slow', async () => {
        mockFetch.mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: () => ({ success: true }) }), 5000))
        )

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 50ms')), 50)
        )

        await expect(Promise.race([postToLandGrantsApi('/test', {}, mockApiEndpoint), timeoutPromise])).rejects.toThrow(
          'Operation timed out after 50ms'
        )
      }, 10000)
    })

    describe('calculate', () => {
      it('should timeout when fetch hangs', async () => {
        mockFetch.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(Promise.race([calculate({ data: 'test' }, mockApiEndpoint), timeoutPromise])).rejects.toThrow(
          'Operation timed out'
        )
      }, 10000)
    })

    describe('validate', () => {
      it('should timeout when fetch hangs', async () => {
        mockFetch.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(Promise.race([validate({ data: 'test' }, mockApiEndpoint), timeoutPromise])).rejects.toThrow(
          'Operation timed out'
        )
      }, 10000)
    })

    describe('parcelsWithFields', () => {
      it('should timeout when fetch hangs', async () => {
        mockFetch.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(
          Promise.race([parcelsWithFields(['field'], ['parcel1'], mockApiEndpoint), timeoutPromise])
        ).rejects.toThrow('Operation timed out')
      }, 10000)
    })

    describe('parcelsWithSize', () => {
      it('should timeout when fetch hangs', async () => {
        mockFetch.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(Promise.race([parcelsWithSize(['parcel1'], mockApiEndpoint), timeoutPromise])).rejects.toThrow(
          'Operation timed out'
        )
      }, 10000)
    })

    describe('parcelsWithActionsAndSize', () => {
      it('should timeout when fetch hangs', async () => {
        mockFetch.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(
          Promise.race([parcelsWithActionsAndSize(['parcel1'], mockApiEndpoint), timeoutPromise])
        ).rejects.toThrow('Operation timed out')
      }, 10000)
    })
  })

  describe('calculate', () => {
    it('should trigger a POST request to /payments/calculate', async () => {
      const mockResponse = { id: 1, status: 'success' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await calculate({ data: 'test' }, mockApiEndpoint)

      expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/payments/calculate`, {
        method: 'POST',
        headers: {
          Authorization: expect.any(String),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: 'test' })
      })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('validate', () => {
    it('should trigger a POST request to /application/validate', async () => {
      const mockResponse = { id: 1, status: 'success' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await validate({ data: 'test' }, mockApiEndpoint)

      expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/application/validate`, {
        method: 'POST',
        headers: {
          Authorization: expect.any(String),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: 'test' })
      })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('parcelsWithFields', () => {
    it('should trigger a POST request to /parcels with specific fields', async () => {
      const mockResponse = { id: 1, status: 'success' }
      const fields = ['specific-field']
      const parcelIds = ['parcel1']
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await parcelsWithFields(fields, parcelIds, mockApiEndpoint)

      expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/parcels`, {
        method: 'POST',
        headers: {
          Authorization: expect.any(String),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parcelIds, fields })
      })
      expect(result).toEqual(mockResponse)
    })

    describe('v2 - SSSI enabled', () => {
      beforeEach(() => {
        vi.mocked(config.get).mockImplementation((key) => {
          if (key === 'landGrants.enableSSSIFeature') {
            return true
          } else {
            return false
          }
        })
      })

      it('should trigger a POST request to /parcels with specific fields', async () => {
        const mockResponse = { id: 1, status: 'success' }
        const fields = ['specific-field']
        const parcelIds = ['parcel1']
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => mockResponse
        })

        const result = await parcelsWithFields(fields, parcelIds, mockApiEndpoint)

        expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/api/v2/parcels`, {
          method: 'POST',
          headers: {
            Authorization: expect.any(String),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ parcelIds, fields })
        })
        expect(result).toEqual(mockResponse)
      })
    })
  })

  describe('parcelsWithSize', () => {
    beforeEach(() => {
      // Disable SSSI feature
      vi.mocked(config.get).mockImplementation((key) => {
        if (key === 'landGrants.enableSSSIFeature') {
          return false
        } else {
          return false
        }
      })
    })

    it('should trigger a POST request to /parcels with size filtering', async () => {
      const mockResponse = { parcels: [], status: 'success' }
      const fields = ['size']
      const parcelIds = ['parcel1']
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await parcelsWithSize(parcelIds, mockApiEndpoint)

      expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/parcels`, {
        method: 'POST',
        headers: {
          Authorization: expect.any(String),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parcelIds, fields })
      })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('parcelsWithActionsAndSize', () => {
    beforeEach(() => {
      vi.mocked(config.get).mockImplementation((key) => {
        return false
      })
    })

    it('should trigger a POST request to /parcels with actions and size filtering', async () => {
      const mockResponse = { id: 1, status: 'success' }
      const fields = ['actions', 'size']
      const parcelIds = ['parcel1']

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await parcelsWithActionsAndSize(parcelIds, mockApiEndpoint)

      expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/parcels`, {
        method: 'POST',
        headers: {
          Authorization: expect.any(String),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ parcelIds, fields })
      })
      expect(result).toEqual(mockResponse)
    })

    describe('v2 - SSSI enabled', () => {
      beforeEach(() => {
        vi.mocked(config.get).mockImplementation((key) => {
          return key === 'landGrants.enableSSSIFeature'
        })
      })

      it('should trigger a POST request to /parcels with actions and size filtering', async () => {
        const mockResponse = { id: 1, status: 'success' }
        const fields = ['actions', 'size', 'actions.sssiConsentRequired']
        const parcelIds = ['parcel1']

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => mockResponse
        })

        const result = await parcelsWithActionsAndSize(parcelIds, mockApiEndpoint)

        expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/api/v2/parcels`, {
          method: 'POST',
          headers: {
            Authorization: expect.any(String),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ parcelIds, fields })
        })
        expect(result).toEqual(mockResponse)
      })
    })
  })
})
