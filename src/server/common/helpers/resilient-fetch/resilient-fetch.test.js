import { resilientFetch } from './resilient-fetch.js'

jest.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: () => ({ warn: (...args) => jest.fn(...args) })
}))

describe('resilientFetch', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('should resolve with response if fetch succeeds first try', async () => {
    const mockResponse = { ok: true, status: 200, statusText: 'Success' }
    fetch.mockResolvedValueOnce(mockResponse)

    const result = await resilientFetch('https://test.url', { timeout: 100, retryDelay: 100 })
    expect(result).toBe(mockResponse)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('should throw if fetch throws (network error)', async () => {
    fetch.mockRejectedValue(new Error('Network error'))

    const promise = resilientFetch('https://fail.url', { retries: 1, timeout: 100, retryDelay: 100 })

    await Promise.resolve()
    jest.advanceTimersByTime(200)

    await expect(promise).rejects.toThrow('Network error')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('should timeout if fetch takes too long', async () => {
    fetch.mockImplementation((url, options) => {
      return new Promise((resolve, reject) => {
        // Simulate a long-running request
        const longTimeout = setTimeout(() => resolve({ ok: true }), 300)

        // Handle abort signal
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(longTimeout)
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }
      })
    })

    const promise = resilientFetch('https://timeout.url', { timeout: 100 })

    jest.advanceTimersByTime(100)

    await expect(promise).rejects.toThrow('The operation was aborted')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('should retry on timeout and then succeed', async () => {
    const goodResponse = { ok: true, status: 200, statusText: 'Success' }

    fetch
      .mockImplementationOnce((url, options) => {
        return new Promise((resolve, reject) => {
          // Simulate a long-running request
          const longTimeout = setTimeout(() => resolve({ ok: true }), 10000)

          // Handle abort signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(longTimeout)
              const error = new Error('The operation was aborted')
              error.name = 'AbortError'
              reject(error)
            })
          }
        })
      })
      .mockResolvedValueOnce(goodResponse)

    const promise = resilientFetch('https://timeout.url', { retries: 2, timeout: 10000, retryDelay: 100 })

    await jest.runAllTimersAsync()

    const result = await promise
    expect(result).toBe(goodResponse)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
