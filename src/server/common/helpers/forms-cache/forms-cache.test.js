import { vi } from 'vitest'
import { getFormsCacheService } from './forms-cache.js'

describe('getFormsCacheService', () => {
  it('should return the cache service from the forms-engine-plugin', () => {
    const mockCacheService = {
      clearState: vi.fn(),
      getItem: vi.fn(),
      setItem: vi.fn()
    }

    const mockServer = {
      plugins: {
        'forms-engine-plugin': {
          cacheService: mockCacheService
        }
      }
    }

    const result = getFormsCacheService(mockServer)

    expect(result).toBe(mockCacheService)
  })

  it('should throw an error if forms-engine-plugin is not available', () => {
    const mockServer = {
      plugins: {}
    }

    expect(() => {
      getFormsCacheService(mockServer)
    }).toThrow()
  })

  it('should return undefined if cacheService is not available in the plugin', () => {
    const mockServer = {
      plugins: {
        'forms-engine-plugin': {}
      }
    }

    const result = getFormsCacheService(mockServer)
    expect(result).toBeUndefined()
  })
})
