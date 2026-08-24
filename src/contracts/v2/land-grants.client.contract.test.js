import { PactV3, MatchersV3, SpecificationVersion } from '@pact-foundation/pact'
import { arrayContaining, integer } from '@pact-foundation/pact/src/v3/matchers'
import path from 'path'
import { vi } from 'vitest'
import {
  postToLandGrantsApi as postToLandGrantsApiClient,
  validate
} from '~/src/server/land-grants/services/land-grants.client'

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__/logger-mocks.js')
  return mockLogHelper()
})

vi.mock('~/src/server/common/helpers/retry.js', () => ({
  retry: (operation) => operation()
}))

const { like, eachLike, nullValue, number, string } = MatchersV3
const userContext = { defraIdToken: 'defra-id-access-token', sbi: '123456789' }
const makeLandGrantsHeaders = () => ({
  'Content-Type': 'application/json',
  'x-forwarded-authorization': userContext.defraIdToken
})
const postToLandGrantsApi = (endpoint, body, baseUrl) => postToLandGrantsApiClient(endpoint, body, baseUrl, userContext)

const validateApplication = (request, baseUrl) => validate(request, baseUrl, userContext)

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const CALCULATE_PATH = '/api/v2/payments/calculate'
const PARCELS_PATH = '/api/v2/parcels'
const VALIDATE_PATH = '/api/v2/application/validate'

const PARCEL_8083 = { sheetId: 'SD6743', parcelId: '8083' }
const HAS_8083 = { parcels: [PARCEL_8083] }
const HAS_NO_PARCELS = { parcels: [] }
const HAS_5677 = { parcels: [{ sheetId: 'SD7861', parcelId: '5677' }] }
const actionWithLimitedAvailability = like({
  code: string('CLIG3'),
  description: string('Manage grassland with very low nutrient inputs'),
  guidanceUrl: string(
    'https://www.gov.uk/find-funding-for-land-or-farms/clig3-manage-grassland-with-very-low-nutrient-inputs'
  ),
  ratePerUnitGbp: number(151),
  availability: { unit: string('ha'), value: number(10.5) }
})
const actionWithUnrestrictedAvailability = like({
  code: string('WBD1'),
  description: string('Manage ponds'),
  guidanceUrl: string('https://www.gov.uk/find-funding-for-land-or-farms/wbd1-manage-ponds'),
  ratePerUnitGbp: number(257),
  availability: { unit: string('count'), value: nullValue() }
})

const parcelsWithActionAvailability = (sizeValue) => ({
  message: 'success',
  parcels: eachLike({
    parcelId: string('SD6743'),
    sheetId: string('8083'),
    size: { unit: string('ha'), value: number(sizeValue) },
    actions: arrayContaining(actionWithLimitedAvailability, actionWithUnrestrictedAvailability)
  })
})

const expectActionAvailability = (response) => {
  const actions = response.parcels[0].actions

  expect(actions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        availability: expect.objectContaining({ unit: 'ha', value: expect.any(Number) }),
        guidanceUrl: expect.any(String)
      }),
      expect.objectContaining({
        availability: { unit: 'count', value: null },
        guidanceUrl: expect.any(String)
      })
    ])
  )
}

function createProvider() {
  return new PactV3({
    dir: path.resolve(process.cwd(), 'src/contracts/pacts'),
    consumer: 'grants-ui',
    provider: 'land-grants-api',
    spec: SpecificationVersion.SPECIFICATION_VERSION_V4,
    port: 0
  })
}

/**
 * Register one interaction and run `assert` against the mock provider.
 * `given` is optional - a malformed request never reaches parcel lookup, so
 * those interactions carry no provider state.
 */
function pactInteraction(
  { given, receiving, path: requestPath, body, status, responseBody, responseBodyHasMatchers = false },
  assert
) {
  const provider = createProvider()
  const withState = given ? provider.given('has parcels', given) : provider

  return withState
    .uponReceiving(receiving)
    .withRequest({ method: 'POST', path: requestPath, headers: makeLandGrantsHeaders(), body })
    .willRespondWith({
      status,
      headers: JSON_HEADERS,
      body: responseBodyHasMatchers ? responseBody : like(responseBody)
    })
    .executeTest(assert)
}

/**
 * Register an error interaction and return whatever the client rejected with,
 * for the calling test to assert on.
 */
async function catchApiError({ path: requestPath, body, status, error, message, call, ...rest }) {
  let caught
  await pactInteraction(
    { path: requestPath, body, status, responseBody: { statusCode: status, error, message }, ...rest },
    async (mockserver) => {
      caught = await call(mockserver.url).then(
        () => new Error('expected the request to be rejected'),
        (rejection) => rejection
      )
    }
  )
  return caught
}

/** An error contract exercised through the generic POST client. */
const catchPostError = ({ path: requestPath, body, ...rest }) =>
  catchApiError({
    path: requestPath,
    body,
    call: (baseUrl) => postToLandGrantsApi(requestPath, body, baseUrl),
    ...rest
  })

/** An error contract exercised through `validate()`, which appends the sbi itself. */
const catchValidateError = ({ payload, ...rest }) =>
  catchApiError({
    path: VALIDATE_PATH,
    body: { ...payload, sbi: userContext.sbi },
    call: (baseUrl) => validateApplication(payload, baseUrl),
    ...rest
  })

/** Every validate response carries per-action rule outcomes. */
const expectValidatedActionShape = (response) => {
  expect(response.actions.length).toBeGreaterThan(0)
  expect(response.actions[0]).toHaveProperty('actionCode')
  expect(response.actions[0]).toHaveProperty('hasPassed')
  expect(response.actions[0]).toHaveProperty('rules')
}

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

    await pactInteraction(
      {
        given: {
          parcels: [
            { sheetId: 'SD6743', parcelId: '8083' },
            { sheetId: 'SD6743', parcelId: '8084' }
          ]
        },
        receiving: 'a calculate request for a valid parcel and action',
        path: CALCULATE_PATH,
        body: payload,
        status: 200,
        responseBody: { message: 'success', payment: calculateResponseContract }
      },
      async (mockserver) => {
        const response = await postToLandGrantsApi(CALCULATE_PATH, payload, mockserver.url)
        expect(response.payment).toEqual(expectedPaymentResponse)
      }
    )
  })

  it.each([
    [
      400,
      'a calculate request for an invalid parcel',
      HAS_NO_PARCELS,
      { parcel: [{ sheetId: 'INVALID', parcelId: 'PARCEL', actions: [{ code: 'CMOR1', quantity: 1.0 }] }] },
      'Bad Request',
      'Land parcels not found: INVALID-PARCEL'
    ],
    [
      400,
      'a calculate request for an invalid action',
      HAS_8083,
      { parcel: [{ ...PARCEL_8083, actions: [{ code: 'INVALID_ACTION', quantity: 1.0 }] }] },
      'Bad Request',
      'Actions not found: INVALID_ACTION'
    ],
    [
      422,
      'a calculate request with invalid quantity',
      HAS_8083,
      { parcel: [{ ...PARCEL_8083, actions: [{ code: 'UPL1', quantity: 'invalid quantity provided' }] }] },
      'Unprocessable Entity',
      'Quantity must be a positive number'
    ],
    [
      422,
      'a calculate request with a negative quantity',
      HAS_8083,
      { parcel: [{ ...PARCEL_8083, actions: [{ code: 'UPL1', quantity: -5.0 }] }] },
      'Unprocessable Entity',
      'Quantity must be a positive number'
    ]
  ])('returns HTTP %s for %s', async (status, receiving, given, body, error, message) => {
    const caught = await catchPostError({ path: CALCULATE_PATH, status, receiving, given, body, error, message })

    expect(caught).toMatchObject({ code: status, status })
  })
})

describe('parcels', () => {
  it.each([
    [
      400,
      'a v2 request for a wrong field name',
      HAS_8083,
      { parcelIds: ['SD6743-8083'], fields: ['WRONG'], sbi: userContext.sbi },
      'Bad Request',
      '"fields[0]" must be one of [size, actions, actions.results]'
    ],
    [
      400,
      'a v2 request for a malformed parcel with size field',
      undefined,
      { parcelIds: ['BADFORMAT-91977'], fields: ['size'], sbi: userContext.sbi },
      'Bad Request',
      '"parcelIds[0]" with value "BADFORMAT-91977" fails to match the required pattern: /^[A-Za-z0-9]{6}-[0-9]{4}$/'
    ],
    [
      404,
      'a v2 request for a not found parcel with size field',
      HAS_NO_PARCELS,
      { parcelIds: ['SD6843-1234'], fields: ['size'], sbi: userContext.sbi },
      'Not Found',
      'Land parcel not found: SD6843-1234'
    ],
    [
      400,
      'a v2 request for multiple parcels with SSSI consent information',
      {
        parcels: [
          { sheetId: 'SD6743', parcelId: '8083' },
          { sheetId: 'SD6743', parcelId: '8084' }
        ]
      },
      {
        parcelIds: ['SD6743-8083', 'SD6743-8084'],
        fields: ['actions', 'size', 'actions.sssiConsentRequired'],
        plannedActions: [],
        sbi: userContext.sbi
      },
      'Bad Request',
      'SSSI consent required is not supported for multiple parcels.'
    ],
    [
      400,
      'a v2 request for a malformed parcel with actions and size',
      undefined,
      { parcelIds: ['MALFORMED-PARCEL'], fields: ['actions', 'size'], plannedActions: [], sbi: userContext.sbi },
      'Bad Request',
      '"parcelIds[0]" with value "MALFORMED-PARCEL" fails to match the required pattern: /^[A-Za-z0-9]{6}-[0-9]{4}$/'
    ],
    [
      404,
      'a v2 request for a not found parcel with actions and size',
      HAS_NO_PARCELS,
      { parcelIds: ['SD1234-5678'], fields: ['actions', 'size'], plannedActions: [], sbi: userContext.sbi },
      'Not Found',
      'Land parcel not found: SD1234-5678'
    ]
  ])('returns HTTP %s for %s', async (status, receiving, given, body, error, message) => {
    const caught = await catchPostError({ path: PARCELS_PATH, status, receiving, given, body, error, message })

    expect(caught).toMatchObject({ code: status, status })
  })

  it('returns HTTP 200 and a list of parcels with size', async () => {
    const parcelWithSizeExample = { sheetId: 'SD6743', parcelId: '8083', size: { value: 23.3424, unit: 'ha' } }
    const requestBody = { parcelIds: ['SD6743-8083'], fields: ['size'], sbi: userContext.sbi }

    await pactInteraction(
      {
        given: HAS_8083,
        receiving: 'a v2 request for specific parcels with size field',
        path: PARCELS_PATH,
        body: requestBody,
        status: 200,
        responseBody: { message: 'success', parcels: eachLike(parcelWithSizeExample) }
      },
      async (mockserver) => {
        const response = await postToLandGrantsApi(PARCELS_PATH, requestBody, mockserver.url)
        expect(response.parcels[0]).toEqual(parcelWithSizeExample)
      }
    )
  })

  it('returns HTTP 200 with consent information for a single parcel', async () => {
    const parcelSize = 23.3424
    const requestBody = {
      parcelIds: ['SD6743-8083'],
      fields: ['actions', 'size', 'actions.sssiConsentRequired', 'actions.heferRequired'],
      sbi: userContext.sbi
    }

    await pactInteraction(
      {
        given: HAS_8083,
        receiving: 'a v2 request for a single parcel with SSSI consent information',
        path: PARCELS_PATH,
        body: requestBody,
        status: 200,
        responseBody: parcelsWithActionAvailability(parcelSize),
        responseBodyHasMatchers: true
      },
      async (mockserver) => {
        const response = await postToLandGrantsApi(PARCELS_PATH, requestBody, mockserver.url)

        expect(response.parcels[0].size.value).toBe(parcelSize)
        expectActionAvailability(response)
      }
    )
  })

  it('returns HTTP 200 with guidance and availability always included on each action', async () => {
    const parcelSize = 23.3424
    const requestBody = {
      parcelIds: ['SD6743-8083'],
      fields: ['actions', 'size'],
      sbi: userContext.sbi
    }

    await pactInteraction(
      {
        given: HAS_8083,
        receiving: 'a v2 request for a single parcel with actions and size, expecting guidance and availability',
        path: PARCELS_PATH,
        body: requestBody,
        status: 200,
        responseBody: parcelsWithActionAvailability(parcelSize),
        responseBodyHasMatchers: true
      },
      async (mockserver) => {
        const response = await postToLandGrantsApi(PARCELS_PATH, requestBody, mockserver.url)

        expect(response.parcels[0].parcelId).toBe('SD6743')
        expect(response.parcels[0].sheetId).toBe('8083')

        expectActionAvailability(response)
      }
    )
  })

  it('returns HTTP 200 and a list of parcels with actions and size', async () => {
    const parcelSize = 23.3424
    const requestBody = {
      parcelIds: ['SD6743-8083'],
      fields: ['actions', 'size'],
      plannedActions: [],
      sbi: userContext.sbi
    }

    await pactInteraction(
      {
        given: HAS_8083,
        receiving: 'a v2 request for a single parcel with actions and size',
        path: PARCELS_PATH,
        body: requestBody,
        status: 200,
        responseBody: parcelsWithActionAvailability(parcelSize),
        responseBodyHasMatchers: true
      },
      async (mockserver) => {
        const response = await postToLandGrantsApi(PARCELS_PATH, requestBody, mockserver.url)
        expect(response.parcels[0].size.value).toBe(parcelSize)
        expectActionAvailability(response)
      }
    )
  })

  it('returns HTTP 200 with availability recomputed against a non-empty plannedActions selection', async () => {
    const parcelSize = 4.5341
    const requestBody = {
      parcelIds: ['SD6743-8083'],
      fields: ['actions', 'size'],
      plannedActions: [{ actionCode: 'UPL1', quantity: 1.0, unit: 'ha' }],
      sbi: userContext.sbi
    }

    await pactInteraction(
      {
        given: HAS_8083,
        receiving: 'a v2 request for a single parcel with actions and size, competing against a planned selection',
        path: PARCELS_PATH,
        body: requestBody,
        status: 200,
        responseBody: parcelsWithActionAvailability(parcelSize),
        responseBodyHasMatchers: true
      },
      async (mockserver) => {
        const response = await postToLandGrantsApi(PARCELS_PATH, requestBody, mockserver.url)
        expect(response.parcels[0].size.value).toBe(parcelSize)
        expectActionAvailability(response)
      }
    )
  })
})

describe('validate', () => {
  const moorlandRules = (passed, reason) =>
    like({
      name: string('parcel-has-intersection-with-data-layer-moorland'),
      passed: like(passed),
      reason: string(reason)
    })

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
            moorlandRules(true, 'This parcel is majority on the moorland'),
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
            moorlandRules(true, 'This parcel is majority on the moorland'),
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

    await pactInteraction(
      {
        given: HAS_5677,
        receiving: 'a v2 validation request for multiple actions with no caveat',
        path: VALIDATE_PATH,
        body: { ...payload, sbi: userContext.sbi },
        status: 200,
        responseBody: validateResponseExample
      },
      async (mockserver) => {
        const response = await validateApplication(payload, mockserver.url)

        expect(response.valid).toBe(true)
        expectValidatedActionShape(response)
      }
    )
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
            moorlandRules(true, 'This parcel is majority on the moorland'),
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
      applicantCrn: 'crn',
      landActions: [
        {
          sheetId: 'SD7861',
          parcelId: '5677',
          actions: [{ code: 'UPL1', quantity: 12.4034 }]
        }
      ]
    }

    await pactInteraction(
      {
        given: HAS_5677,
        receiving: 'a v2 validation request for an action with SSSI caveat',
        path: VALIDATE_PATH,
        body: { ...payload, sbi: userContext.sbi },
        status: 200,
        responseBody: validateResponseExample
      },
      async (mockserver) => {
        const response = await validateApplication(payload, mockserver.url)

        expect(response.valid).toBe(true)
        expectValidatedActionShape(response)

        const sssiRule = response.actions[0].rules.find((rule) => rule.name === 'sssi-consent-required-sssi')
        expect(sssiRule).toBeDefined()
        expect(sssiRule).toHaveProperty('caveat')
        expect(sssiRule.caveat).toHaveProperty('code')
        expect(sssiRule.caveat).toHaveProperty('metadata')
      }
    )
  })

  it('returns HTTP 200 when parcel fails moorland check with no SSSI caveat', async () => {
    const failedMoorlandRules = eachLike({
      name: string('parcel-has-intersection-with-data-layer-moorland'),
      passed: like(false),
      reason: string('This parcel is not majority on the moorland')
    })
    const validateResponseWithMoorlandFailure = {
      message: 'Application validated successfully',
      valid: false,
      actions: [
        like({
          actionCode: 'CMOR1',
          sheetId: 'SK0971',
          parcelId: '4262',
          hasPassed: false,
          rules: failedMoorlandRules
        }),
        {
          actionCode: 'UPL1',
          sheetId: 'SK0971',
          parcelId: '4262',
          hasPassed: false,
          rules: failedMoorlandRules
        }
      ],
      id: like(23)
    }

    const payload = {
      applicationId: '123',
      requester: 'local',
      applicantCrn: 'crn',
      landActions: [
        {
          sheetId: 'SK0971',
          parcelId: '4262',
          actions: [{ code: 'CMOR1', quantity: 1 }]
        }
      ]
    }

    await pactInteraction(
      {
        given: { parcels: [{ sheetId: 'SK0971', parcelId: '4262' }] },
        receiving: 'a v2 validation request that fails moorland check without SSSI caveat',
        path: VALIDATE_PATH,
        body: { ...payload, sbi: userContext.sbi },
        status: 200,
        responseBody: validateResponseWithMoorlandFailure
      },
      async (mockserver) => {
        const response = await validateApplication(payload, mockserver.url)

        expect(response.valid).toBe(false)
        expectValidatedActionShape(response)
      }
    )
  })

  it.each([
    [
      422,
      'a v2 validation request for invalid quantity',
      HAS_8083,
      {
        applicationId: '34E-8CA-45D',
        requester: 'grants-ui',
        applicantCrn: '1100014934',
        landActions: [{ ...PARCEL_8083, actions: [{ code: 'CMOR1', quantity: 'invalid quantity provided' }] }]
      },
      'Unprocessable Entity',
      'Quantity must be a positive number'
    ],
    [
      422,
      'a v2 validation request for negative quantity',
      HAS_8083,
      {
        applicationId: '34E-8CA-45D',
        requester: 'grants-ui',
        applicantCrn: '1100014934',
        landActions: [{ ...PARCEL_8083, actions: [{ code: 'CMOR1', quantity: -0.14472089 }] }]
      },
      'Unprocessable Entity',
      'Quantity must be a positive number'
    ],
    [
      400,
      'a v2 validation request with missing required fields',
      HAS_8083,
      // Missing applicantCrn and landActions
      { applicationId: '34E-8CA-45D', requester: 'grants-ui' },
      'Bad Request',
      '"applicantCrn" is required'
    ],
    [
      400,
      'a v2 validation request for a non-existent parcel',
      HAS_NO_PARCELS,
      {
        applicationId: '34E-8CA-45D',
        requester: 'grants-ui',
        applicantCrn: '1100014934',
        landActions: [{ sheetId: 'NONEXIST', parcelId: '9999', actions: [{ code: 'CMOR1', quantity: 0.14472089 }] }]
      },
      'Bad Request',
      'Land parcels not found: NONEXIST-9999'
    ]
  ])('returns HTTP %s for %s', async (status, receiving, given, payload, error, message) => {
    const caught = await catchValidateError({ status, receiving, given, payload, error, message })

    expect(caught).toMatchObject({ code: status, status })
  })
})
