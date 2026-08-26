import { describe, expect, it, vi } from 'vitest'
import { validateWoodlandHectares, calculateWmpPayment, calculateWmpPaymentByTotalArea } from './woodland.service.js'
import * as woodlandClient from './woodland.client.js'

vi.mock('./woodland.client.js', () => ({
  validateWoodland: vi.fn(),
  calculateWmp: vi.fn(),
  calculateWmpByTotalArea: vi.fn()
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
const userContext = { defraIdToken: 'defra-id-token', sbi: '123456789' }

describe('validateWoodlandHectares', () => {
  const args = { parcelIds: ['SD6346-3387'], hectaresTenOrOverYearsOld: 2, hectaresUnderTenYearsOld: 1 }

  it('returns an empty array when all rules pass', async () => {
    woodlandClient.validateWoodland.mockResolvedValue(
      makeResponse([{ name: 'rule-1', passed: true, reason: 'All good' }])
    )

    const result = await validateWoodlandHectares(args, userContext)

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

    const result = await validateWoodlandHectares(args, userContext)

    expect(result).toEqual(['Area too large', 'Parcel ineligible'])
  })

  it('returns an empty array when result is missing', async () => {
    woodlandClient.validateWoodland.mockResolvedValue({ message: 'success' })

    const result = await validateWoodlandHectares(args, userContext)

    expect(result).toEqual([])
  })

  it('passes parcel IDs and hectare values to the client', async () => {
    woodlandClient.validateWoodland.mockResolvedValue(makeResponse([]))

    await validateWoodlandHectares(args, userContext)

    expect(woodlandClient.validateWoodland).toHaveBeenCalledWith(
      { parcelIds: ['SD6346-3387'], hectaresTenOrOverYearsOld: 2, hectaresUnderTenYearsOld: 1 },
      'http://api',
      userContext
    )
  })
})

describe('calculateWmpPayment', () => {
  const mockPayment = {
    agreementTotalPence: 375000,
    agreementStartDate: '2026-06-01',
    agreementEndDate: '2036-06-01',
    frequency: 'Single',
    parcelItems: {},
    agreementLevelItems: {
      1: { code: 'PA3', description: 'Woodland Management Plan', agreementTotalPence: 375000 }
    }
  }

  it('calls calculateWmp with correct args and returns payment and totalPence', async () => {
    woodlandClient.calculateWmp.mockResolvedValueOnce({ message: 'success', payment: mockPayment })

    const result = await calculateWmpPayment(
      {
        parcelIds: ['SD6346-3387'],
        hectaresUnderTenYearsOld: 1.5,
        hectaresTenOrOverYearsOld: 0.5
      },
      userContext
    )

    expect(woodlandClient.calculateWmp).toHaveBeenCalledWith(
      { parcelIds: ['SD6346-3387'], hectaresUnderTenYearsOld: 1.5, hectaresTenOrOverYearsOld: 0.5 },
      'http://api',
      userContext
    )
    expect(result).toEqual({ payment: mockPayment, totalPence: 375000 })
  })

  it('returns zero totalPence when agreementTotalPence is missing', async () => {
    woodlandClient.calculateWmp.mockResolvedValueOnce({ message: 'success', payment: {} })

    const result = await calculateWmpPayment(
      {
        parcelIds: ['SD6346-3387'],
        hectaresUnderTenYearsOld: 0,
        hectaresTenOrOverYearsOld: 0
      },
      userContext
    )

    expect(result).toEqual({ payment: {}, totalPence: 0 })
  })

  it('propagates API errors', async () => {
    woodlandClient.calculateWmp.mockRejectedValueOnce(new Error('API error'))

    await expect(
      calculateWmpPayment(
        { parcelIds: ['SD6346-3387'], hectaresUnderTenYearsOld: 0, hectaresTenOrOverYearsOld: 0 },
        userContext
      )
    ).rejects.toThrow('API error')
  })
})

describe('calculateWmpPaymentByTotalArea', () => {
  const mockPayment = {
    agreementTotalPence: 375000,
    agreementStartDate: '2026-06-01',
    agreementEndDate: '2036-06-01',
    frequency: 'Single',
    parcelItems: {},
    agreementLevelItems: {
      1: { code: 'PA3', description: 'Woodland Management Plan', agreementTotalPence: 375000 }
    }
  }

  it('calls calculateWmpByTotalArea with correct args and returns payment and totalPence', async () => {
    woodlandClient.calculateWmpByTotalArea.mockResolvedValueOnce({ message: 'success', payment: mockPayment })

    const result = await calculateWmpPaymentByTotalArea(
      { totalAreaHa: 24.95, applicationId: 'WMP-A1B2-C3D4', sbi: '123456789', crn: '1234567890' },
      userContext
    )

    expect(woodlandClient.calculateWmpByTotalArea).toHaveBeenCalledWith(
      { totalAreaHa: 24.95, applicationId: 'WMP-A1B2-C3D4', sbi: '123456789', crn: '1234567890' },
      'http://api',
      userContext
    )
    expect(result).toEqual({ payment: mockPayment, totalPence: 375000 })
  })

  it.each([{ payment: {} }, { payment: { agreementTotalPence: null } }, {}])(
    'throws rather than coalescing to zero when agreementTotalPence is missing: %o',
    async (response) => {
      woodlandClient.calculateWmpByTotalArea.mockResolvedValueOnce({ message: 'success', ...response })

      await expect(
        calculateWmpPaymentByTotalArea(
          { totalAreaHa: 24.95, applicationId: 'WMP-A1B2-C3D4', sbi: '123456789' },
          userContext
        )
      ).rejects.toThrow('Land Grants API returned no agreementTotalPence for the claim payment')
    }
  )

  it('returns a zero total when the API genuinely calculates zero', async () => {
    woodlandClient.calculateWmpByTotalArea.mockResolvedValueOnce({
      message: 'success',
      payment: { agreementTotalPence: 0 }
    })

    const result = await calculateWmpPaymentByTotalArea(
      { totalAreaHa: 24.95, applicationId: 'WMP-A1B2-C3D4', sbi: '123456789' },
      userContext
    )

    expect(result).toEqual({ payment: { agreementTotalPence: 0 }, totalPence: 0 })
  })

  it('propagates API errors', async () => {
    woodlandClient.calculateWmpByTotalArea.mockRejectedValueOnce(new Error('API error'))

    await expect(
      calculateWmpPaymentByTotalArea(
        { totalAreaHa: 24.95, applicationId: 'WMP-A1B2-C3D4', sbi: '123456789' },
        userContext
      )
    ).rejects.toThrow('API error')
  })
})
