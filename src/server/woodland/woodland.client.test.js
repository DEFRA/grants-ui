import { describe, expect, it, vi } from 'vitest'
import { validateWoodland } from './woodland.client.js'
import * as landGrantsClient from '~/src/server/land-grants/services/land-grants.client.js'

vi.mock('~/src/server/land-grants/services/land-grants.client.js', () => ({
  postToLandGrantsApi: vi.fn().mockResolvedValue({ message: 'success' })
}))

describe('validateWoodland', () => {
  it('posts to the validate endpoint with the given payload and base URL', async () => {
    const payload = { parcelIds: ['SD6346-3387'], oldWoodlandAreaHa: 2, newWoodlandAreaHa: 1 }

    const result = await validateWoodland(payload, 'http://api')

    expect(landGrantsClient.postToLandGrantsApi).toHaveBeenCalledWith(
      '/api/v1/wmp/validate',
      payload,
      'http://api'
    )
    expect(result).toEqual({ message: 'success' })
  })
})
