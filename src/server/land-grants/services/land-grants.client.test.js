import { postToLandGrantsApi } from './land-grants.client.js'
import { vi } from 'vitest'
import { retry } from '~/src/server/common/helpers/retry.js'

vi.mock('~/src/server/common/helpers/retry.js')

/** @type {import('vitest').MockedFunction<any>} */
const mockFetch = vi.fn()
global.fetch = mockFetch

const mockApiEndpoint = 'http://mock-land-grants-api'

describe('postToLandGrantsApi', () => {
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

  it('should handle 500 error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    })

    await expect(postToLandGrantsApi('/error', {}, mockApiEndpoint)).rejects.toThrow('Internal Server Error')

    let code, message
    try {
      await postToLandGrantsApi('/error', {}, mockApiEndpoint)
    } catch (error) {
      code = error.code
      message = error.message
    }

    expect(code).toBe(500)
    expect(message).toBe('Internal Server Error')
  })

  it('should handle network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    try {
      await postToLandGrantsApi('/test', {}, mockApiEndpoint)
      expect(true).toBe(false) // Should not reach here
    } catch (error) {
      expect(error.message).toBe('Network error')
    }
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
})
