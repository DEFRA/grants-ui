import {
  calculate,
  parcelsGroups,
  parcelsWithExtendedInfo,
  parcelsWithFields,
  parcelsWithSize,
  postToLandGrantsApi,
  validate
} from './land-grants.client.js'
import { vi } from 'vitest'
import { retry } from '~/src/server/common/helpers/retry.js'
import { log } from '~/src/server/common/helpers/logging/log.js'

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
        statusText: 'Not Found',
        arrayBuffer: vi.fn().mockResolvedValue(undefined)
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
        statusText: 'Internal Server Error',
        arrayBuffer: vi.fn().mockResolvedValue(undefined)
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
        json: mockJson,
        arrayBuffer: vi.fn().mockResolvedValue(undefined)
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

    it.each([400, 401, 403, 500, 502, 503])(
      'propagates upstream status %i as both error.code and error.status',
      async (status) => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status,
          statusText: `Error ${status}`,
          arrayBuffer: vi.fn().mockResolvedValue(undefined)
        })

        await expect(postToLandGrantsApi('/test', {}, mockApiEndpoint)).rejects.toMatchObject({
          code: status,
          status
        })
      }
    )

    it('should log EXTERNAL_API_ERROR with upstreamStatus and service when BE returns 502', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        arrayBuffer: vi.fn().mockResolvedValue(undefined)
      })

      await expect(postToLandGrantsApi('/test', {}, mockApiEndpoint)).rejects.toThrow('Bad Gateway')

      // Call-site log: fired before the error is rethrown, capturing upstream status
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' }),
        expect.objectContaining({
          endpoint: '/test',
          service: 'grants-ui-backend',
          upstreamStatus: 502,
          errorMessage: 'Bad Gateway'
        })
      )
    })

    it('should log EXTERNAL_API_ERROR with attempts after retry exhaustion', async () => {
      // Make retry behave as if it tried multiple times before giving up.
      retry.mockImplementationOnce(async (operation) => {
        await operation().catch(() => {})
        await operation().catch(() => {})
        return operation()
      })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        arrayBuffer: vi.fn().mockResolvedValue(undefined)
      })

      await expect(postToLandGrantsApi('/test', {}, mockApiEndpoint)).rejects.toThrow('Bad Gateway')

      const exhaustionLogCall = log.mock.calls.find(
        ([code, opts]) => code?.level === 'error' && opts?.attempts !== undefined
      )
      expect(exhaustionLogCall).toBeDefined()
      expect(exhaustionLogCall[1]).toEqual(
        expect.objectContaining({
          endpoint: '/test',
          service: 'grants-ui-backend',
          upstreamStatus: 502,
          attempts: 3,
          errorMessage: 'Bad Gateway'
        })
      )
    })

    it('should fall back to lastUpstreamStatus when retry error has no status or code', async () => {
      // Simulate a retry-level failure (e.g. timeout) where the rejected error has no status/code,
      // but the inner operation already captured an upstream status via lastUpstreamStatus.
      retry.mockImplementationOnce(async (operation) => {
        await operation().catch(() => {})
        const timeoutError = new Error('Operation timed out')
        throw timeoutError
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        arrayBuffer: vi.fn().mockResolvedValue(undefined)
      })

      await expect(postToLandGrantsApi('/test', {}, mockApiEndpoint)).rejects.toThrow('Operation timed out')

      const exhaustionLogCall = log.mock.calls.find(
        ([code, opts]) => code?.level === 'error' && opts?.errorMessage === 'Operation timed out'
      )
      expect(exhaustionLogCall).toBeDefined()
      expect(exhaustionLogCall[1]).toEqual(
        expect.objectContaining({
          endpoint: '/test',
          service: 'grants-ui-backend',
          upstreamStatus: 502,
          errorMessage: 'Operation timed out'
        })
      )
    })

    it('should pass null upstreamStatus when no upstream response was received', async () => {
      // Network-level failure: fetch rejects before any HTTP response arrives.
      retry.mockImplementationOnce(async () => {
        throw new Error('Network down')
      })

      await expect(postToLandGrantsApi('/test', {}, mockApiEndpoint)).rejects.toThrow('Network down')

      const exhaustionLogCall = log.mock.calls.find(
        ([code, opts]) => code?.level === 'error' && opts?.errorMessage === 'Network down'
      )
      expect(exhaustionLogCall).toBeDefined()
      expect(exhaustionLogCall[1]).toEqual(
        expect.objectContaining({
          endpoint: '/test',
          service: 'grants-ui-backend',
          upstreamStatus: null,
          errorMessage: 'Network down'
        })
      )
    })

    it('should use error.code when error.status is missing', async () => {
      retry.mockImplementationOnce(async () => {
        const err = /** @type {Error & {code?: number}} */ (new Error('Forbidden'))
        err.code = 403
        throw err
      })

      await expect(postToLandGrantsApi('/test', {}, mockApiEndpoint)).rejects.toThrow('Forbidden')

      const exhaustionLogCall = log.mock.calls.find(
        ([code, opts]) => code?.level === 'error' && opts?.errorMessage === 'Forbidden'
      )
      expect(exhaustionLogCall).toBeDefined()
      expect(exhaustionLogCall[1]).toEqual(
        expect.objectContaining({
          endpoint: '/test',
          service: 'grants-ui-backend',
          upstreamStatus: 403,
          errorMessage: 'Forbidden'
        })
      )
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

    describe('parcelsWithExtendedInfo', () => {
      it('should timeout when fetch hangs', async () => {
        mockFetch.mockImplementation(() => new Promise(() => {}))

        const timeoutPromise = new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('Operation timed out after 100ms')), 100)
        )

        await expect(
          Promise.race([parcelsWithExtendedInfo(['parcel1'], mockApiEndpoint), timeoutPromise])
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

      expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/api/v2/payments/calculate`, {
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
    it('should trigger a POST request to /api/v2/application/validate', async () => {
      const mockResponse = { id: 1, status: 'success' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await validate({ data: 'test' }, mockApiEndpoint)

      expect(mockFetch).toHaveBeenCalledWith(`${mockApiEndpoint}/api/v2/application/validate`, {
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
    it('should trigger a POST request to /api/v2/parcels with specific fields', async () => {
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

  describe('parcelsWithSize', () => {
    it('should trigger a POST request to /api/v2/parcels with size filtering', async () => {
      const mockResponse = { parcels: [], status: 'success' }
      const fields = ['size']
      const parcelIds = ['parcel1']
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await parcelsWithSize(parcelIds, mockApiEndpoint)

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

  describe('parcelsGroups', () => {
    it('should trigger a POST request to /api/v2/parcels with groups filtering', async () => {
      const mockResponse = { groups: [{ name: 'Test', actions: ['T1'] }] }
      const fields = ['groups']
      const parcelIds = ['parcel1']
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await parcelsGroups(parcelIds, mockApiEndpoint)

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

  describe('parcelsWithExtendedInfo', () => {
    it('should trigger a POST request to /api/v2/parcels with actions, size, and groups', async () => {
      const mockResponse = { id: 1, status: 'success' }
      const fields = ['actions', 'size', 'groups']
      const parcelIds = ['parcel1']

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await parcelsWithExtendedInfo(parcelIds, mockApiEndpoint)

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

    it('should include consent type fields from getConsentTypes', async () => {
      const mockResponse = { id: 1, status: 'success' }
      const parcelIds = ['parcel1']

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await parcelsWithExtendedInfo(parcelIds, mockApiEndpoint)

      // The actual fields depend on what getConsentTypes returns
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.parcelIds).toEqual(parcelIds)
      expect(callBody.fields).toContain('actions')
      expect(callBody.fields).toContain('size')
      expect(callBody.fields).toContain('groups')
      expect(result).toEqual(mockResponse)
    })
  })
})
