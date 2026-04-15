import { describe, expect, it, vi } from 'vitest'
import { calculateWmp, validateWoodland } from './woodland.client.js'
import * as landGrantsClient from '~/src/server/land-grants/services/land-grants.client.js'

vi.mock('~/src/server/land-grants/services/land-grants.client.js', () => ({
  postToLandGrantsApi: vi.fn().mockResolvedValue({ message: 'success' })
}))

describe('validateWoodland', () => {
  it('posts to the validate endpoint mapping new field names to old API names', async () => {
    const result = await validateWoodland(
      { parcelIds: ['SD6346-3387'], hectaresTenOrOverYearsOld: 2, hectaresUnderTenYearsOld: 1 },
      'http://api'
    )

    expect(landGrantsClient.postToLandGrantsApi).toHaveBeenCalledWith('/api/v1/wmp/validate', {
      parcelIds: ['SD6346-3387'],
      oldWoodlandAreaHa: 2,
      newWoodlandAreaHa: 1
    }, 'http://api')
    expect(result).toEqual({ message: 'success' })
  })
})

describe('calculateWmp', () => {
  it('posts to the calculate endpoint mapping new field names to old API names', async () => {
    landGrantsClient.postToLandGrantsApi.mockResolvedValueOnce({ message: 'success', payment: { agreementTotalPence: 375000 } })

    const result = await calculateWmp(
      { parcelIds: ['SD6346-3387'], hectaresTenOrOverYearsOld: 0, hectaresUnderTenYearsOld: 0 },
      'http://api'
    )

    expect(landGrantsClient.postToLandGrantsApi).toHaveBeenCalledWith('/api/v1/wmp/payments/calculate', {
      parcelIds: ['SD6346-3387'],
      oldWoodlandAreaHa: 0,
      newWoodlandAreaHa: 0
    }, 'http://api')
    expect(result).toEqual({ message: 'success', payment: { agreementTotalPence: 375000 } })
  })
})
