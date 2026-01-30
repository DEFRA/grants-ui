import { PactV3, MatchersV3, SpecificationVersion } from '@pact-foundation/pact'
import { arrayContaining, integer } from '@pact-foundation/pact/src/v3/matchers'
import path from 'path'
import { vi } from 'vitest'
import { postToLandGrantsApi } from '~/src/server/land-grants/services/land-grants.client'

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  logger: {
    debug: vi.fn()
  }
}))

const { like, eachLike, string } = MatchersV3

const provider = new PactV3({
  dir: path.resolve(process.cwd(), 'src/contracts/pacts'),
  consumer: 'grants-ui',
  provider: 'land-grants-api-v2',
  spec: SpecificationVersion.SPECIFICATION_VERSION_V4
})

describe('calculate', () => {
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
        const response = await postToLandGrantsApi('/api/v2/payments/calculate', payload, mockserver.url)
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
          await postToLandGrantsApi('/api/v2/payments/calculate', badRequestPayload, mockserver.url)
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
          await postToLandGrantsApi('/api/v2/payments/calculate', badRequestPayload, mockserver.url)
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
      .uponReceiving('a calculate request with invalid quantity')
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
          await postToLandGrantsApi('/api/v2/payments/calculate', invalidQuantityPayload, mockserver.url)
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
          await postToLandGrantsApi('/api/v2/payments/calculate', invalidQuantityPayload, mockserver.url)
        } catch (error) {
          expect(error.code).toBe(422)
          expect(error.message).toBe('Unprocessable Entity')
        }
      })
  })
})

describe('parcels', () => {
  it('returns HTTP 400 when passing a wrong field name', async () => {
    const badRequestResponseExample = {
      statusCode: 400,
      error: 'Bad Request',
      message: '"fields[0]" must be one of [size, actions, actions.results]'
    }
    const EXPECTED_BODY = like(badRequestResponseExample)

    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SD6743', parcelId: '8083' }] })
      .uponReceiving('a v2 request for a wrong field name')
      .withRequest({
        method: 'POST',
        path: '/api/v2/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['SD6743-8083'], fields: ['WRONG'] }
      })
      .willRespondWith({ status: 400, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        try {
          await postToLandGrantsApi(
            '/api/v2/parcels',
            { parcelIds: ['SD6743-8083'], fields: ['WRONG'] },
            mockserver.url
          )
        } catch (error) {
          expect(error.code).toBe(400)
          expect(error.message).toBe('Bad Request')
        }
      })
  })

  it('returns HTTP 200 and a list of parcels with size', async () => {
    const parcelWithSizeExample = { sheetId: 'SD6743', parcelId: '8083', size: { value: 23.3424, unit: 'ha' } }
    const EXPECTED_BODY = like({ message: 'success', parcels: eachLike(parcelWithSizeExample) })

    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SD6743', parcelId: '8083' }] })
      .uponReceiving('a v2 request for specific parcels with size field')
      .withRequest({
        method: 'POST',
        path: '/api/v2/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['SD6743-8083'], fields: ['size'] }
      })
      .willRespondWith({ status: 200, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        const response = await postToLandGrantsApi(
          '/api/v2/parcels',
          { parcelIds: ['SD6743-8083'], fields: ['size'] },
          mockserver.url
        )
        expect(response.parcels[0]).toEqual(parcelWithSizeExample)
      })
  })

  it('returns HTTP 400 when passing a wrong formatted parcel', async () => {
    const badRequestResponseExample = {
      statusCode: 400,
      error: 'Bad Request',
      message:
        '"parcelIds[0]" with value "BADFORMAT-91977" fails to match the required pattern: /^[A-Za-z0-9]{6}-[0-9]{4}$/'
    }
    const EXPECTED_BODY = like(badRequestResponseExample)

    await provider
      .uponReceiving('a v2 request for a malformed parcel with size field')
      .withRequest({
        method: 'POST',
        path: '/api/v2/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['BADFORMAT-91977'], fields: ['size'] }
      })
      .willRespondWith({ status: 400, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        try {
          await postToLandGrantsApi(
            '/api/v2/parcels',
            { parcelIds: ['BADFORMAT-91977'], fields: ['size'] },
            mockserver.url
          )
        } catch (error) {
          expect(error.code).toBe(400)
          expect(error.message).toBe('Bad Request')
        }
      })
  })

  it('returns HTTP 404 when parcel with size field is not found', async () => {
    const notFoundParcelExample = {
      statusCode: 404,
      error: 'Not Found',
      message: 'Land parcel not found: SD6843-1234'
    }
    const EXPECTED_BODY = like(notFoundParcelExample)

    await provider
      .given('has parcels', { parcels: [] })
      .uponReceiving('a v2 request for a not found parcel with size field')
      .withRequest({
        method: 'POST',
        path: '/api/v2/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['SD6843-1234'], fields: ['size'] }
      })
      .willRespondWith({ status: 404, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        try {
          await postToLandGrantsApi('/api/v2/parcels', { parcelIds: ['SD6843-1234'], fields: ['size'] }, mockserver.url)
        } catch (error) {
          expect(error.code).toBe(404)
          expect(error.message).toBe('Not Found')
        }
      })
  })

  it('returns HTTP 200 with SSSI consent information for a single parcel', async () => {
    const parcelWithSSSIExample = {
      parcelId: 'SD6743',
      sheetId: '8083',
      size: { value: 23.3424, unit: 'ha' },
      actions: [
        {
          code: 'CMOR1',
          availableArea: { value: 10.5, unit: 'ha' },
          description: 'Assess moorland and produce a written record',
          ratePerUnitGbp: 10.6,
          ratePerAgreementPerYearGbp: 272,
          sssiConsentRequired: false
        },
        {
          code: 'UPL1',
          availableArea: { value: 20.75, unit: 'ha' },
          description: 'Moderate livestock grazing on moorland',
          ratePerUnitGbp: 20,
          sssiConsentRequired: true
        },
        {
          code: 'UPL2',
          availableArea: { value: 15.25, unit: 'ha' },
          description: 'Moderate livestock grazing on moorland',
          ratePerUnitGbp: 53,
          sssiConsentRequired: true
        }
      ]
    }
    const EXPECTED_BODY = like({ message: 'success', parcels: eachLike(parcelWithSSSIExample) })

    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SD6743', parcelId: '8083' }] })
      .uponReceiving('a v2 request for a single parcel with SSSI consent information')
      .withRequest({
        method: 'POST',
        path: '/api/v2/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['SD6743-8083'], fields: ['actions', 'size', 'actions.sssiConsentRequired'] }
      })
      .willRespondWith({ status: 200, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        const response = await postToLandGrantsApi(
          '/api/v2/parcels',
          { parcelIds: ['SD6743-8083'], fields: ['actions', 'size', 'actions.sssiConsentRequired'] },
          mockserver.url
        )
        expect(response.parcels[0]).toEqual(parcelWithSSSIExample)
        expect(response.parcels[0].actions[0].sssiConsentRequired).toBe(false)
        expect(response.parcels[0].actions[1].sssiConsentRequired).toBe(true)
        expect(response.parcels[0].actions[1].sssiConsentRequired).toBe(true)
      })
  })

  it('returns HTTP 400 when requesting SSSI consent information for multiple parcels', async () => {
    const badRequestResponseExample = {
      statusCode: 400,
      error: 'Bad Request',
      message: 'SSSI consent required is not supported for multiple parcels.'
    }
    const EXPECTED_BODY = like(badRequestResponseExample)

    await provider
      .given('has parcels', {
        parcels: [
          { sheetId: 'SD6743', parcelId: '8083' },
          { sheetId: 'SD6743', parcelId: '8084' }
        ]
      })
      .uponReceiving('a v2 request for multiple parcels with SSSI consent information')
      .withRequest({
        method: 'POST',
        path: '/api/v2/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: {
          parcelIds: ['SD6743-8083', 'SD6743-8084'],
          fields: ['actions', 'size', 'actions.sssiConsentRequired'],
          plannedActions: []
        }
      })
      .willRespondWith({ status: 400, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        try {
          await postToLandGrantsApi(
            '/api/v2/parcels',
            {
              parcelIds: ['SD6743-8083', 'SD6743-8084'],
              fields: ['actions', 'size', 'actions.sssiConsentRequired'],
              plannedActions: []
            },
            mockserver.url
          )
        } catch (error) {
          expect(error.code).toBe(400)
          expect(error.message).toBe('Bad Request')
        }
      })
  })

  it('returns HTTP 200 and a list of parcels with actions and size', async () => {
    const parcelWithActionsAndSizeExample = {
      parcelId: 'SD6743',
      sheetId: '8083',
      size: { value: 23.3424, unit: 'ha' },
      actions: [
        {
          code: 'CMOR1',
          availableArea: { value: 10.5, unit: 'ha' },
          description: 'Assess moorland and produce a written record',
          ratePerUnitGbp: 10.6,
          ratePerAgreementPerYearGbp: 272
        },
        {
          code: 'UPL1',
          availableArea: { value: 20.75, unit: 'ha' },
          description: 'Moderate livestock grazing on moorland',
          ratePerUnitGbp: 20
        },
        {
          code: 'UPL2',
          availableArea: { value: 15.25, unit: 'ha' },
          description: 'Moderate livestock grazing on moorland',
          ratePerUnitGbp: 53
        }
      ]
    }
    const EXPECTED_BODY = like({ message: 'success', parcels: eachLike(parcelWithActionsAndSizeExample) })

    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SD6743', parcelId: '8083' }] })
      .uponReceiving('a v2 request for a single parcel with actions and size')
      .withRequest({
        method: 'POST',
        path: '/api/v2/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['SD6743-8083'], fields: ['actions', 'size'] }
      })
      .willRespondWith({ status: 200, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        const response = await postToLandGrantsApi(
          '/api/v2/parcels',
          { parcelIds: ['SD6743-8083'], fields: ['actions', 'size'] },
          mockserver.url
        )
        expect(response.parcels[0]).toEqual(parcelWithActionsAndSizeExample)
      })
  })

  it('returns HTTP 400 when parcel id is malformed', async () => {
    const badRequestResponseExample = {
      statusCode: 400,
      error: 'Bad Request',
      message:
        '"parcelIds[0]" with value "MALFORMED-PARCEL" fails to match the required pattern: /^[A-Za-z0-9]{6}-[0-9]{4}$/'
    }
    const EXPECTED_BODY = like(badRequestResponseExample)

    await provider
      .uponReceiving('a v2 request for a malformed parcel with actions and size')
      .withRequest({
        method: 'POST',
        path: '/api/v2/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['MALFORMED-PARCEL'], fields: ['actions', 'size'] }
      })
      .willRespondWith({ status: 400, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        try {
          await postToLandGrantsApi(
            '/api/v2/parcels',
            { parcelIds: ['MALFORMED-PARCEL'], fields: ['actions', 'size'] },
            mockserver.url
          )
        } catch (error) {
          expect(error.code).toBe(400)
          expect(error.message).toBe('Bad Request')
        }
      })
  })

  it('returns HTTP 404 when parcel with actions and size is not found', async () => {
    const notFoundParcelExample = {
      statusCode: 404,
      error: 'Not Found',
      message: 'Land parcel not found: SD1234-5678'
    }
    const EXPECTED_BODY = like(notFoundParcelExample)

    await provider
      .given('has parcels', { parcels: [] })
      .uponReceiving('a v2 request for a not found parcel with actions and size')
      .withRequest({
        method: 'POST',
        path: '/api/v2/parcels',
        headers: { 'Content-Type': 'application/json' },
        body: { parcelIds: ['SD1234-5678'], fields: ['actions', 'size'] }
      })
      .willRespondWith({ status: 404, headers: { 'Content-Type': 'application/json' }, body: EXPECTED_BODY })
      .executeTest(async (mockserver) => {
        try {
          await postToLandGrantsApi(
            '/api/v2/parcels',
            { parcelIds: ['SD1234-5678'], fields: ['actions', 'size'] },
            mockserver.url
          )
        } catch (error) {
          expect(error.code).toBe(404)
          expect(error.message).toBe('Not Found')
        }
      })
  })
})

describe('validate', () => {
  it('returns HTTP 200 with validation for multiple actions with no caveat', async () => {
    const validateResponseExample = {
      id: like(33),
      message: 'Application validated successfully',
      valid: true,
      actions: [
        like({
          actionCode: 'CMOR1',
          sheetId: 'SD7861',
          parcelId: 'SD7861',
          hasPassed: true,
          rules: arrayContaining(
            like({
              name: string('parcel-has-intersection-with-data-layer-moorland'),
              passed: like(true),
              reason: string('This parcel is majority on the moorland')
            }),
            like({
              name: string('applied-for-total-available-area'),
              passed: like(true),
              reason: string('There is sufficient available area (12.4034 ha) for the applied figure (12.4034 ha)')
            })
          )
        }),
        like({
          actionCode: 'UPL1',
          sheetId: 'SD7861',
          parcelId: '5677',
          hasPassed: true,
          rules: arrayContaining(
            like({
              name: string('parcel-has-intersection-with-data-layer-moorland'),
              passed: like(true),
              reason: string('This parcel is majority on the moorland')
            }),
            like({
              name: string('applied-for-total-available-area'),
              passed: like(true),
              reason: string('There is sufficient available area (12.4034 ha) for the applied figure (12.4034 ha)')
            }),
            like({
              name: string('sssi-consent-required-sssi'),
              passed: like(true),
              reason: string('No consent is required from Natural England')
            })
          )
        })
      ]
    }

    const payload = {
      applicationId: '123',
      requester: 'local',
      sbi: '123456789',
      applicantCrn: 'crn',
      landActions: [
        {
          sheetId: 'SD7861',
          parcelId: '5677',
          actions: [
            { code: 'CMOR1', quantity: 12.4034 },
            { code: 'UPL1', quantity: 12.4034 }
          ]
        }
      ]
    }
    const EXPECTED_BODY = like(validateResponseExample)

    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SD7861', parcelId: '5677' }] })
      .uponReceiving('a v2 validation request for multiple actions with no caveat')
      .withRequest({
        method: 'POST',
        path: '/api/v2/application/validate',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        const response = await postToLandGrantsApi('/api/v2/application/validate', payload, mockserver.url)

        expect(response.valid).toBe(true)
        expect(response.actions).toBeDefined()
        expect(response.actions.length).toBeGreaterThan(0)
        expect(response.actions[0]).toHaveProperty('actionCode')
        expect(response.actions[0]).toHaveProperty('hasPassed')
        expect(response.actions[0]).toHaveProperty('rules')
      })
  })

  it('returns HTTP 200 with validation for an action including SSSI caveat', async () => {
    const validateResponseExample = {
      message: 'Application validated successfully',
      valid: true,
      id: like(22),
      actions: [
        like({
          actionCode: 'UPL1',
          sheetId: 'SD7861',
          parcelId: '5677',
          hasPassed: true,
          rules: [
            like({
              name: string('parcel-has-intersection-with-data-layer-moorland'),
              passed: like(true),
              reason: string('This parcel is majority on the moorland')
            }),
            like({
              name: string('applied-for-total-available-area'),
              passed: like(true),
              reason: string('There is sufficient available area')
            }),
            like({
              name: string('sssi-consent-required-sssi'),
              passed: like(true),
              reason: string('A consent is required from Natural England'),
              caveat: like({
                code: string('sssi-consent-required'),
                description: string('A consent is required from Natural England'),
                metadata: like({
                  percentageOverlap: like(15.33),
                  overlapAreaHectares: like(1.9015)
                })
              })
            })
          ]
        })
      ]
    }

    const payload = {
      applicationId: '123',
      requester: 'local',
      sbi: '123456789',
      applicantCrn: 'crn',
      landActions: [
        {
          sheetId: 'SD7861',
          parcelId: '5677',
          actions: [{ code: 'UPL1', quantity: 12.4034 }]
        }
      ]
    }
    const EXPECTED_BODY = like(validateResponseExample)

    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SD7861', parcelId: '5677' }] })
      .uponReceiving('a v2 validation request for an action with SSSI caveat')
      .withRequest({
        method: 'POST',
        path: '/api/v2/application/validate',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        const response = await postToLandGrantsApi('/api/v2/application/validate', payload, mockserver.url)

        expect(response.valid).toBe(true)
        expect(response.actions).toBeDefined()
        expect(response.actions.length).toBeGreaterThan(0)
        expect(response.actions[0]).toHaveProperty('actionCode')
        expect(response.actions[0]).toHaveProperty('hasPassed')
        expect(response.actions[0]).toHaveProperty('rules')

        const sssiRule = response.actions[0].rules.find((rule) => rule.name === 'sssi-consent-required-sssi')
        expect(sssiRule).toBeDefined()
        expect(sssiRule).toHaveProperty('caveat')
        expect(sssiRule.caveat).toHaveProperty('code')
        expect(sssiRule.caveat).toHaveProperty('metadata')
      })
  })

  it('returns HTTP 200 when parcel fails moorland check with no SSSI caveat', async () => {
    const validateResponseWithMoorlandFailure = {
      message: 'Application validated successfully',
      valid: false,
      actions: [
        like({
          actionCode: 'CMOR1',
          sheetId: 'SK0971',
          parcelId: '4262',
          hasPassed: false,
          rules: eachLike({
            name: string('parcel-has-intersection-with-data-layer-moorland'),
            passed: like(false),
            reason: string('This parcel is not majority on the moorland')
          })
        }),
        {
          actionCode: 'UPL1',
          sheetId: 'SK0971',
          parcelId: '4262',
          hasPassed: false,
          rules: eachLike({
            name: string('parcel-has-intersection-with-data-layer-moorland'),
            passed: like(false),
            reason: string('This parcel is not majority on the moorland')
          })
        }
      ],
      id: like(23)
    }

    const payload = {
      applicationId: '123',
      requester: 'local',
      sbi: '123456789',
      applicantCrn: 'crn',
      landActions: [
        {
          sheetId: 'SK0971',
          parcelId: '4262',
          actions: [{ code: 'CMOR1', quantity: 1 }]
        }
      ]
    }
    const EXPECTED_BODY = like(validateResponseWithMoorlandFailure)

    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SK0971', parcelId: '4262' }] })
      .uponReceiving('a v2 validation request that fails moorland check without SSSI caveat')
      .withRequest({
        method: 'POST',
        path: '/api/v2/application/validate',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        const response = await postToLandGrantsApi('/api/v2/application/validate', payload, mockserver.url)

        expect(response.valid).toBe(false)
        expect(response.actions).toBeDefined()
        expect(response.actions.length).toBeGreaterThan(0)
        expect(response.actions[0]).toHaveProperty('actionCode')
        expect(response.actions[0]).toHaveProperty('hasPassed')
        expect(response.actions[0]).toHaveProperty('rules')
      })
  })

  it('returns HTTP 422 with error message when quantity is a string', async () => {
    const negativeQuantityPayload = {
      applicationId: '34E-8CA-45D',
      requester: 'grants-ui',
      sbi: '106284736',
      applicantCrn: '1100014934',
      landActions: [
        {
          sheetId: 'SD6743',
          parcelId: '8083',
          actions: [{ code: 'CMOR1', quantity: 'invalid quantity provided' }]
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
      .uponReceiving('a v2 validation request for invalid quantity')
      .withRequest({
        method: 'POST',
        path: '/api/v2/application/validate',
        headers: { 'Content-Type': 'application/json' },
        body: negativeQuantityPayload
      })
      .willRespondWith({
        status: 422,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        try {
          await postToLandGrantsApi('/api/v2/application/validate', negativeQuantityPayload, mockserver.url)
        } catch (error) {
          expect(error.code).toBe(422)
          expect(error.message).toBe('Unprocessable Entity')
        }
      })
  })

  it('returns HTTP 422 with error message when quantity is negative', async () => {
    const negativeQuantityPayload = {
      applicationId: '34E-8CA-45D',
      requester: 'grants-ui',
      sbi: '106284736',
      applicantCrn: '1100014934',
      landActions: [
        {
          sheetId: 'SD6743',
          parcelId: '8083',
          actions: [{ code: 'CMOR1', quantity: -0.14472089 }]
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
      .uponReceiving('a v2 validation request for negative quantity')
      .withRequest({
        method: 'POST',
        path: '/api/v2/application/validate',
        headers: { 'Content-Type': 'application/json' },
        body: negativeQuantityPayload
      })
      .willRespondWith({
        status: 422,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        try {
          await postToLandGrantsApi('/api/v2/application/validate', negativeQuantityPayload, mockserver.url)
        } catch (error) {
          expect(error.code).toBe(422)
          expect(error.message).toBe('Unprocessable Entity')
        }
      })
  })

  it('returns HTTP 400 when required fields are missing', async () => {
    const incompletePayload = {
      applicationId: '34E-8CA-45D',
      requester: 'grants-ui'
      // Missing sbi, applicantCrn, and landActions
    }

    const badRequestResponseExample = {
      statusCode: 400,
      error: 'Bad Request',
      message: '"sbi" is required'
    }
    const EXPECTED_BODY = like(badRequestResponseExample)

    await provider
      .given('has parcels', { parcels: [{ sheetId: 'SD6743', parcelId: '8083' }] })
      .uponReceiving('a v2 validation request with missing required fields')
      .withRequest({
        method: 'POST',
        path: '/api/v2/application/validate',
        headers: { 'Content-Type': 'application/json' },
        body: incompletePayload
      })
      .willRespondWith({
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        try {
          await postToLandGrantsApi('/api/v2/application/validate', incompletePayload, mockserver.url)
        } catch (error) {
          expect(error.code).toBe(400)
          expect(error.message).toBe('Bad Request')
        }
      })
  })

  it('returns HTTP 400 when parcel is not found', async () => {
    const notFoundPayload = {
      applicationId: '34E-8CA-45D',
      requester: 'grants-ui',
      sbi: '106284736',
      applicantCrn: '1100014934',
      landActions: [
        {
          sheetId: 'NONEXIST',
          parcelId: '9999',
          actions: [{ code: 'CMOR1', quantity: 0.14472089 }]
        }
      ]
    }

    const notFoundResponseExample = {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Land parcels not found: NONEXIST-9999'
    }

    const EXPECTED_BODY = like(notFoundResponseExample)

    await provider
      .given('has parcels', { parcels: [] })
      .uponReceiving('a v2 validation request for a non-existent parcel')
      .withRequest({
        method: 'POST',
        path: '/api/v2/application/validate',
        headers: { 'Content-Type': 'application/json' },
        body: notFoundPayload
      })
      .willRespondWith({
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: EXPECTED_BODY
      })
      .executeTest(async (mockserver) => {
        try {
          await postToLandGrantsApi('/api/v2/application/validate', notFoundPayload, mockserver.url)
        } catch (error) {
          expect(error.code).toBe(400)
          expect(error.message).toBe('Bad Request')
        }
      })
  })
})
