// external-data.test.js
import { describe, expect, it, vi } from 'vitest'
import ExternalDataService from './external-data.service'

describe('ExternalDataService', () => {
  it('should call apiClient.fetch with the correct queryObject and return its result', async () => {
    const mockApiClient = {
      fetch: vi.fn().mockResolvedValue({ data: 'mockData' })
    }

    const service = new ExternalDataService(mockApiClient)
    const queryObject = { key: 'value' }

    const result = await service.fetch(queryObject)

    expect(mockApiClient.fetch).toHaveBeenCalledWith(queryObject)
    expect(result).toEqual({ data: 'mockData' })
  })
})
