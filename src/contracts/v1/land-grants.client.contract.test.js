import { PactV3, MatchersV3, SpecificationVersion } from '@pact-foundation/pact'
import path from 'path'
import { vi } from 'vitest'
import { postToLandGrantsApi } from '~/src/server/land-grants/services/land-grants.client'

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  LogCodes: {
    LAND_GRANTS: {
      API_REQUEST: { level: 'info', messageFunc: vi.fn() }
    }
  },
  log: vi.fn(),
  debug: vi.fn(),
  logger: {
    debug: vi.fn()
  }
}))

vi.mock('~/src/server/common/helpers/retry.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    retry: (operation, options) => actual.retry(operation, { ...options, maxAttempts: 1 })
  }
})

const { like, eachLike, string } = MatchersV3

function createProvider() {
  return new PactV3({
    dir: path.resolve(process.cwd(), 'src/contracts/pacts'),
    consumer: 'grants-ui',
    provider: 'land-grants-api',
    spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
    port: 0
  })
}

describe('wmp/payments/calculate', () => {
  it('returns HTTP 200 and payment information for a valid woodland management plan request', async () => {
    const calculateResponseContract = {
      explanations: [],
      agreementStartDate: string('2025-09-01'),
      agreementEndDate: string('2035-08-31'),
      frequency: string('Single'),
      agreementTotalPence: like(339510),
      parcelItems: like({}),
      agreementLevelItems: like({
        1: {
          code: string('PA3'),
          description: string('Woodland management plan'),
          version: string('1.0.0'),
          parcelIds: eachLike('SD6346-3387'),
          activePaymentTier: like(3),
          quantityInActiveTier: like(26.3397),
          activeTierRatePence: like(1500),
          activeTierFlatRatePence: like(300000),
          quantity: like(126.3397),
          agreementTotalPence: like(339510),
          unit: string('ha')
        }
      }),
      payments: eachLike({
        totalPaymentPence: like(339510),
        paymentDate: null,
        lineItems: eachLike({
          agreementLevelItemId: like(1),
          paymentPence: like(339510)
        })
      })
    }

    const expectedPaymentResponse = {
      explanations: [],
      frequency: 'Single',
      agreementTotalPence: 339510,
      agreementLevelItems: {
        1: {
          code: 'PA3',
          description: 'Woodland management plan',
          quantity: 126.3397,
          agreementTotalPence: 339510,
          unit: 'ha'
        }
      },
      payments: [
        {
          totalPaymentPence: 339510,
          lineItems: [
            {
              agreementLevelItemId: 1,
              paymentPence: 339510
            }
          ]
        }
      ]
    }

    const payload = {
      parcelIds: ['SD6346-3387'],
      oldWoodlandAreaHa: 126.3397,
      newWoodlandAreaHa: 0,
      startDate: '2025-08-05'
    }

    const EXPECTED_BODY = like({
      message: 'success',
      payment: calculateResponseContract
    })

    const provider = createProvider()
    await provider
      .given('has woodland parcels', { parcelIds: ['SD6346-3387'] })
      .uponReceiving('a v1 wmp calculate request for a valid parcel')
      .withRequest({
        method: 'POST',
        path: '/api/v1/wmp/payments/calculate',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        const response = await postToLandGrantsApi('/api/v1/wmp/payments/calculate', payload, mockserver.url)
        expect(response.payment).toMatchObject(expectedPaymentResponse)
      })
  })

  it('returns HTTP 400 when oldWoodlandAreaHa and newWoodlandAreaHa are missing', async () => {
    const invalidPayload = {
      parcelIds: ['SD6346-3387'],
      startDate: '2025-08-05'
    }

    const badRequestResponseExample = {
      statusCode: 400,
      error: 'Bad Request',
      message: '"oldWoodlandAreaHa" is required. "newWoodlandAreaHa" is required',
      validation: like({
        source: 'payload',
        keys: ['oldWoodlandAreaHa', 'newWoodlandAreaHa']
      })
    }

    const EXPECTED_BODY = like(badRequestResponseExample)

    const provider = createProvider()
    await provider
      .uponReceiving('a v1 wmp calculate request with missing woodland area fields')
      .withRequest({
        method: 'POST',
        path: '/api/v1/wmp/payments/calculate',
        headers: { 'Content-Type': 'application/json' },
        body: invalidPayload
      })
      .willRespondWith({
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        await expect(
          postToLandGrantsApi('/api/v1/wmp/payments/calculate', invalidPayload, mockserver.url)
        ).rejects.toMatchObject({ code: 400, message: 'Bad Request' })
      })
  })
})

describe('wmp/validate', () => {
  it('returns HTTP 200 with a passing validation result when woodland areas are sufficient', async () => {
    const validateResponseContract = {
      hasPassed: true,
      code: string('PA3'),
      actionConfigVersion: string('1.0.0'),
      rules: eachLike({
        name: string('parcel-has-minimum-eligibility-for-woodland-management-plan'),
        passed: like(true),
        description: string('Is the parcel eligible for the woodland management plan action?'),
        reason: string('The woodland area over 10 years old (0.5 ha) meets the minimum required area of (0.5 ha)'),
        explanations: eachLike({
          title: string('Woodland minimum eligibility'),
          lines: eachLike('The minimum required woodland area over 10 years old is (0.5 ha), the holding has (0.5 ha)')
        })
      })
    }

    const expectedResult = {
      hasPassed: true,
      code: 'PA3',
      actionConfigVersion: '1.0.0',
      rules: [
        {
          name: 'parcel-has-minimum-eligibility-for-woodland-management-plan',
          passed: true,
          description: 'Is the parcel eligible for the woodland management plan action?',
          reason: 'The woodland area over 10 years old (0.5 ha) meets the minimum required area of (0.5 ha)',
          explanations: [
            {
              title: 'Woodland minimum eligibility',
              lines: ['The minimum required woodland area over 10 years old is (0.5 ha), the holding has (0.5 ha)']
            }
          ]
        }
      ]
    }

    const payload = {
      parcelIds: ['SD7560-9193'],
      newWoodlandAreaHa: 0.5,
      oldWoodlandAreaHa: 0.5
    }

    const EXPECTED_BODY = like({
      message: 'success',
      result: validateResponseContract
    })

    const provider = createProvider()
    await provider
      .given('has woodland parcels', { parcelIds: ['SD7560-9193'] })
      .uponReceiving('a v1 wmp validate request with sufficient woodland area')
      .withRequest({
        method: 'POST',
        path: '/api/v1/wmp/validate',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        const response = await postToLandGrantsApi('/api/v1/wmp/validate', payload, mockserver.url)
        expect(response.result.hasPassed).toBe(true)
        expect(response.result.code).toBe('PA3')
        expect(response.result.rules).toBeDefined()
        expect(response.result.rules.length).toBeGreaterThan(0)
        expect(response.result.rules[0]).toMatchObject(expectedResult.rules[0])
      })
  })

  it('returns HTTP 200 with a failing validation result when no woodland area is provided', async () => {
    const validateResponseContract = {
      hasPassed: false,
      code: string('PA3'),
      actionConfigVersion: string('1.0.0'),
      rules: eachLike({
        name: string('parcel-has-minimum-eligibility-for-woodland-management-plan'),
        passed: like(false),
        description: string('Is the parcel eligible for the woodland management plan action?'),
        reason: string('No woodland area over 10 years old has been provided'),
        explanations: eachLike({
          title: string('Woodland minimum eligibility'),
          lines: eachLike('The minimum required woodland area over 10 years old is (0.5 ha), the holding has (0 ha)')
        })
      })
    }

    const payload = {
      parcelIds: ['SD7560-9193'],
      newWoodlandAreaHa: 0,
      oldWoodlandAreaHa: 0
    }

    const EXPECTED_BODY = like({
      message: 'success',
      result: validateResponseContract
    })

    const provider = createProvider()
    await provider
      .given('has woodland parcels', { parcelIds: ['SD7560-9193'] })
      .uponReceiving('a v1 wmp validate request with zero woodland area')
      .withRequest({
        method: 'POST',
        path: '/api/v1/wmp/validate',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        const response = await postToLandGrantsApi('/api/v1/wmp/validate', payload, mockserver.url)
        expect(response.result.hasPassed).toBe(false)
        expect(response.result.code).toBe('PA3')
        expect(response.result.rules).toBeDefined()
        expect(response.result.rules.length).toBeGreaterThan(0)
        expect(response.result.rules[0].passed).toBe(false)
      })
  })

  it('returns HTTP 400 when oldWoodlandAreaHa is missing', async () => {
    const invalidPayload = {
      parcelIds: ['SD7560-9193']
    }

    const badRequestResponseExample = {
      statusCode: 400,
      error: 'Bad Request',
      message: '"oldWoodlandAreaHa" is required',
      validation: like({
        source: 'payload',
        keys: ['oldWoodlandAreaHa']
      })
    }

    const EXPECTED_BODY = like(badRequestResponseExample)

    const provider = createProvider()
    await provider
      .uponReceiving('a v1 wmp validate request with missing required fields')
      .withRequest({
        method: 'POST',
        path: '/api/v1/wmp/validate',
        headers: { 'Content-Type': 'application/json' },
        body: invalidPayload
      })
      .willRespondWith({
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        await expect(postToLandGrantsApi('/api/v1/wmp/validate', invalidPayload, mockserver.url)).rejects.toMatchObject(
          { code: 400, message: 'Bad Request' }
        )
      })
  })
})
