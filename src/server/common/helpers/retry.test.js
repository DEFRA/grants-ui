// retry.test.js
import { describe, expect, it, vi } from 'vitest'
import { retry } from './retry.js'

describe('retry with exponential backoff', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should resolve immediately if the operation succeeds on the first attempt', async () => {
    const mockOperation = vi.fn().mockResolvedValue('success')
    const result = await retry(mockOperation)
    expect(result).toBe('success')
    expect(mockOperation).toHaveBeenCalledTimes(1)
  })

  it('should retry the specified number of times if the operation fails', async () => {
    let attempt = 0
    const mockOperation = vi.fn(() => {
      attempt++

      if (attempt < 3) {
        throw new Error('Fail')
      }

      return 'success'
    })
    const shouldRetry = vi.fn(() => true)

    const result = await retry(mockOperation, { maxAttempts: 3, shouldRetry })
    expect(result).toBe('success')
    expect(mockOperation).toHaveBeenCalledTimes(3)
  })

  it('should throw the last error if all retry attempts fail', async () => {
    const mockOperation = vi.fn().mockRejectedValue(new Error('Permanent failure'))
    const shouldRetry = vi.fn(() => true)

    await expect(retry(mockOperation, { maxAttempts: 3, shouldRetry })).rejects.toThrow('Permanent failure')
    expect(mockOperation).toHaveBeenCalledTimes(3)
  })

  it('should respect the shouldRetry function and stop retries if it returns false', async () => {
    const mockOperation = vi.fn().mockRejectedValue(new Error('Non-retriable'))
    const shouldRetry = vi.fn((err) => err.message !== 'Non-retriable')
    await expect(retry(mockOperation, { maxAttempts: 3, shouldRetry })).rejects.toThrow('Non-retriable')
    expect(mockOperation).toHaveBeenCalledTimes(1)
    expect(shouldRetry).toHaveBeenCalledTimes(1)
  })

  it('should apply exponential backoff with jitter', async () => {
    const mockOperation = vi.fn().mockRejectedValue(new Error('Fail'))
    const maxDelay = 40
    const initialDelay = 20
    const delays = []
    const onRetry = vi.fn((_, __, delay) => delays.push(delay))
    const shouldRetry = vi.fn(() => true)

    await expect(
      retry(mockOperation, { maxAttempts: 3, initialDelay, shouldRetry, maxDelay, onRetry })
    ).rejects.toThrow('Fail')

    expect(delays.length).toBe(2)
    expect(delays[0]).toBeGreaterThanOrEqual(initialDelay)
    expect(delays[0]).toBeLessThanOrEqual(maxDelay)
    expect(mockOperation).toHaveBeenCalledTimes(3)
  })

  it('should call onRetry callback on each retry attempt', async () => {
    const mockOperation = vi.fn().mockRejectedValue(new Error('Retry error'))
    const onRetry = vi.fn()
    const shouldRetry = vi.fn(() => true)

    await expect(retry(mockOperation, { maxAttempts: 3, onRetry, shouldRetry })).rejects.toThrow('Retry error')
    expect(onRetry).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number))
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 2, expect.any(Number))
  })

  describe('retry timeouts', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterAll(() => {
      vi.useRealTimers()
    })

    it('should time out if the operation exceeds the timeout', async () => {
      const mockOperation = vi.fn(() => new Promise((resolve) => setTimeout(resolve, 2000)))
      const retryPromise = retry(mockOperation, { timeout: 1000, maxAttempts: 1 })

      vi.runAllTimers()

      await expect(retryPromise).rejects.toThrow('Operation timed out')
      expect(mockOperation).toHaveBeenCalledTimes(1)
    })
  })
})
