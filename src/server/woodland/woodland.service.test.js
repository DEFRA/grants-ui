import { describe, expect, it, vi } from 'vitest'
import { validateWoodlandHectares } from './woodland.service.js'
import * as woodlandClient from './woodland.client.js'

vi.mock('./woodland.client.js', () => ({
  validateWoodland: vi.fn()
}))

vi.mock('~/src/config/config.js', () => ({
  config: { get: vi.fn().mockReturnValue('http://api') }
}))

const makeResponse = (rules) => ({
  message: 'success',
  result: {
    hasPassed: rules.every((r) => r.passed),
    code: 'PA3',
    rules
  }
})

describe('validateWoodlandHectares', () => {
  const args = { parcelIds: ['SD6346-3387'], hectaresTenOrOverYearsOld: 2, hectaresUnderTenYearsOld: 1 }

  it('returns an empty array when all rules pass', async () => {
    woodlandClient.validateWoodland.mockResolvedValue(
      makeResponse([{ name: 'rule-1', passed: true, reason: 'All good' }])
    )

    const result = await validateWoodlandHectares(args)

    expect(result).toEqual([])
  })

  it('returns reason strings for each failed rule', async () => {
    woodlandClient.validateWoodland.mockResolvedValue(
      makeResponse([
        { name: 'rule-1', passed: false, reason: 'Area too large' },
        { name: 'rule-2', passed: true, reason: 'Minimum met' },
        { name: 'rule-3', passed: false, reason: 'Parcel ineligible' }
      ])
    )

    const result = await validateWoodlandHectares(args)

    expect(result).toEqual(['Area too large', 'Parcel ineligible'])
  })

  it('returns an empty array when result is missing', async () => {
    woodlandClient.validateWoodland.mockResolvedValue({ message: 'success' })

    const result = await validateWoodlandHectares(args)

    expect(result).toEqual([])
  })

  it('passes parcel IDs and hectare values to the client', async () => {
    woodlandClient.validateWoodland.mockResolvedValue(makeResponse([]))

    await validateWoodlandHectares(args)

    expect(woodlandClient.validateWoodland).toHaveBeenCalledWith(
      { parcelIds: ['SD6346-3387'], hectaresTenOrOverYearsOld: 2, hectaresUnderTenYearsOld: 1 },
      'http://api'
    )
  })
})
