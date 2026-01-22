import { PactV3, MatchersV3, SpecificationVersion } from '@pact-foundation/pact'
import path from 'path'
import { vi } from 'vitest'
import { calculate } from '~/src/server/land-grants/services/land-grants.client'
import { config } from '~/src/config/config.js'

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  logger: {
    debug: vi.fn()
  }
}))

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

const { like, eachLike, integer, arrayContaining, string } = MatchersV3

const provider = new PactV3({
  dir: path.resolve(process.cwd(), 'src/contracts/pacts'),
  consumer: 'grants-ui',
  provider: 'land-grants-api-v2',
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4
})

describe('calculate', () => {
  beforeEach(() => {
    vi.mocked(config.get).mockImplementation((key) => {
      if (key === 'landGrants.enableSSSIFeature') {
        return true
      }
      return false
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns HTTP 200 and payment information for the requested parcels', async () => {
    const calculateResponseContract = {
      explanations: eachLike({
        title: 'Schedule Information',
        content: eachLike('Agreement duration: 3 years')
      }),
      agreementStartDate: '2026-02-01',
      agreementEndDate: '2029-02-01',
      frequency: 'Quarterly',
      agreementTotalPence: 108165,
      annualTotalPence: 36055,
      parcelItems: like({
        1: {
          code: 'UPL1',
          description: 'Moderate livestock grazing on moorland',
          version: string('1.0.0'),
          unit: 'ha',
          quantity: 1.4869,
          rateInPence: 2000,
          annualPaymentPence: 2973,
          sheetId: 'SD6743',
          parcelId: '8083'
        }
      }),
      agreementLevelItems: like({
        1: {
          code: 'CMOR1',
          description: 'Assess moorland and produce a written record',
          version: string('1.0.0'),
          annualPaymentPence: 27200
        }
      }),
      payments: eachLike({
        totalPaymentPence: 9022,
        paymentDate: '2026-05-05',
        lineItems: arrayContaining(
          like({
            parcelItemId: integer(1),
            paymentPence: integer(743)
          }),
          like({
            agreementLevelItemId: integer(1),
            paymentPence: integer(6800)
          })
        )
      })
    }
    const expectedPaymentResponse = {
      explanations: [
        {
          title: 'Schedule Information',
          content: ['Agreement duration: 3 years']
        }
      ],
      agreementStartDate: '2026-02-01',
      agreementEndDate: '2029-02-01',
      frequency: 'Quarterly',
      agreementTotalPence: 108165,
      annualTotalPence: 36055,
      parcelItems: {
        1: {
          code: 'UPL1',
          description: 'Moderate livestock grazing on moorland',
          version: '1.0.0',
          unit: 'ha',
          quantity: 1.4869,
          rateInPence: 2000,
          annualPaymentPence: 2973,
          sheetId: 'SD6743',
          parcelId: '8083'
        }
      },
      agreementLevelItems: {
        1: {
          code: 'CMOR1',
          description: 'Assess moorland and produce a written record',
          version: '1.0.0',
          annualPaymentPence: 27200
        }
      },
      payments: [
        {
          totalPaymentPence: 9022,
          paymentDate: '2026-05-05',
          lineItems: [
            {
              parcelItemId: 1,
              paymentPence: 743
            },
            {
              agreementLevelItemId: 1,
              paymentPence: 6800
            }
          ]
        }
      ]
    }
    const payload = {
      startDate: '01-01-2026',
      parcel: [
        {
          sheetId: 'SD6743',
          parcelId: '8083',
          actions: [
            {
              code: 'UPL1',
              quantity: 1.4869
            },
            {
              code: 'CMOR1',
              quantity: 1.4869
            }
          ]
        },
        {
          sheetId: 'SD6743',
          parcelId: '8084',
          actions: [
            {
              code: 'UPL2',
              quantity: 0.8123
            }
          ]
        }
      ]
    }
    const EXPECTED_BODY = like({
      message: 'success',
      payment: calculateResponseContract
    })
    await provider
      .given('has parcels', {
        parcels: [
          { sheetId: 'SD6743', parcelId: '8083' },
          { sheetId: 'SD6743', parcelId: '8084' }
        ]
      })
      .uponReceiving('a calculate request for a valid parcel and action')
      .withRequest({
        method: 'POST',
        path: '/api/v2/payments/calculate',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        const response = await calculate(payload, mockserver.url)
        expect(response.payment).toEqual(expectedPaymentResponse)
      })
  })

  it('returns HTTP 400 when parcel is invalid', async () => {
    const badRequestPayload = {
      parcel: [
        {
          sheetId: 'INVALID',
          parcelId: 'PARCEL',
          actions: [
            {
              code: 'CMOR1',
              quantity: 1.0
            }
          ]
        }
      ]
    }
    const notFoundResponseExample = {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Land parcels not found: INVALID-PARCEL'
    }
    const EXPECTED_BODY = like(notFoundResponseExample)
    await provider
      .given('has parcels', { parcels: [] })
      .uponReceiving('a calculate request for an invalid parcel')
      .withRequest({
        method: 'POST',
        path: '/api/v2/payments/calculate',
        headers: { 'Content-Type': 'application/json' },
        body: badRequestPayload
      })
      .willRespondWith({
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        try {
          await calculate(badRequestPayload, mockserver.url)
        } catch (error) {
          expect(error.code).toBe(400)
          expect(error.message).toBe('Bad Request')
        }
      })
  })

  it('returns HTTP 400 when action code is invalid', async () => {
    const badRequestPayload = {
      parcel: [
        {
          sheetId: 'SD6743',
          parcelId: '8083',
          actions: [
            {
              code: 'INVALID_ACTION',
              quantity: 1.0
            }
          ]
        }
      ]
    }
    const notFoundResponseExample = {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Actions not found: INVALID_ACTION'
    }
    const EXPECTED_BODY = like(notFoundResponseExample)
    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SD6743', parcelId: '8083' }] })
      .uponReceiving('a calculate request for an invalid action')
      .withRequest({
        method: 'POST',
        path: '/api/v2/payments/calculate',
        headers: { 'Content-Type': 'application/json' },
        body: badRequestPayload
      })
      .willRespondWith({
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        try {
          await calculate(badRequestPayload, mockserver.url)
        } catch (error) {
          expect(error.code).toBe(400)
          expect(error.message).toBe('Bad Request')
        }
      })
  })

  it('returns HTTP 422 when quantity is a string', async () => {
    const invalidQuantityPayload = {
      parcel: [
        {
          sheetId: 'SD6743',
          parcelId: '8083',
          actions: [
            {
              code: 'UPL1',
              quantity: 'invalid quantity provided'
            }
          ]
        }
      ]
    }
    const unprocessableResponseExample = {
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Quantity must be a positive number'
    }
    const EXPECTED_BODY = like(unprocessableResponseExample)
    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SD6743', parcelId: '8083' }] })
      .uponReceiving('a calculate request with a negative quantity')
      .withRequest({
        method: 'POST',
        path: '/api/v2/payments/calculate',
        headers: { 'Content-Type': 'application/json' },
        body: invalidQuantityPayload
      })
      .willRespondWith({
        status: 422,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        try {
          await calculate(invalidQuantityPayload, mockserver.url)
        } catch (error) {
          expect(error.code).toBe(422)
          expect(error.message).toBe('Unprocessable Entity')
        }
      })
  })

  it('returns HTTP 422 when quantity is negative', async () => {
    const invalidQuantityPayload = {
      parcel: [
        {
          sheetId: 'SD6743',
          parcelId: '8083',
          actions: [
            {
              code: 'UPL1',
              quantity: -5.0
            }
          ]
        }
      ]
    }
    const unprocessableResponseExample = {
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Quantity must be a positive number'
    }
    const EXPECTED_BODY = like(unprocessableResponseExample)
    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SD6743', parcelId: '8083' }] })
      .uponReceiving('a calculate request with a negative quantity')
      .withRequest({
        method: 'POST',
        path: '/api/v2/payments/calculate',
        headers: { 'Content-Type': 'application/json' },
        body: invalidQuantityPayload
      })
      .willRespondWith({
        status: 422,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        try {
          await calculate(invalidQuantityPayload, mockserver.url)
        } catch (error) {
          expect(error.code).toBe(422)
          expect(error.message).toBe('Unprocessable Entity')
        }
      })
  })
})
