import { expect, it } from 'vitest'
import { LogCodes } from './log-codes.js'
import {
  testLogCodes,
  TEST_USER_IDS,
  TEST_PATHS,
  TEST_ERRORS,
  TEST_GRANT_TYPES,
  TEST_REFERENCE_NUMBERS,
  TEST_SBI,
  TEST_AGREEMENT_TYPES
} from './log-codes.test-helpers.js'

describe('LogCodes', () => {
  it('should define log code categories covered by this file', () => {
    expect(LogCodes.LAND_GRANTS).toBeDefined()
    expect(LogCodes.PURGE).toBeDefined()
  })

  describe('LAND_GRANTS log codes', () => {
    testLogCodes('LAND_GRANTS', [
      [
        'LAND_GRANT_APPLICATION_STARTED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT },
        `Land grant application started for CRN=${TEST_USER_IDS.MASKED}`
      ],
      [
        'LAND_GRANT_APPLICATION_SUBMITTED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, referenceNumber: TEST_REFERENCE_NUMBERS.REF_123 },
        `Land grant application submitted for CRN=${TEST_USER_IDS.MASKED}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}`
      ],
      [
        'LAND_GRANT_ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Land grant processing error for CRN=${TEST_USER_IDS.MASKED}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      ['NO_LAND_PARCELS_FOUND', 'warn', { sbi: TEST_SBI.DEFAULT }, `No land parcels found for sbi=${TEST_SBI.DEFAULT}`],
      [
        'NO_ACTIONS_FOUND',
        'error',
        { parcelId: 'testParcelId', sheetId: 'testSheetId' },
        `No actions found | parcelId: testParcelId | sheetId: testSheetId`
      ],
      [
        'VALIDATE_APPLICATION_ERROR',
        'error',
        {
          errorMessage: 'testErrorMessage',
          statusCode: 422,
          sbi: TEST_SBI.DEFAULT,
          parcelId: 'testParcelId',
          sheetId: 'testSheetId',
          selectedActions: ['CMOR1']
        },
        `Error validating application: testErrorMessage | statusCode: 422 | sbi: ${TEST_SBI.DEFAULT} | parcelId: testParcelId | sheetId: testSheetId | selectedActions: ["CMOR1"]`
      ],
      [
        'FETCH_ACTIONS_ERROR',
        'error',
        {
          errorMessage: 'testErrorMessage',
          statusCode: 422,
          sbi: TEST_SBI.DEFAULT,
          parcelId: 'testParcelId',
          sheetId: 'testSheetId'
        },
        `Error fetching actions: testErrorMessage | statusCode: 422 | sbi: ${TEST_SBI.DEFAULT} | parcelId: testParcelId | sheetId: testSheetId`
      ],
      [
        'UNAUTHORISED_PARCEL',
        'error',
        {
          errorMessage: 'testErrorMessage',
          sbi: TEST_SBI.DEFAULT,
          selectedLandParcel: 'A1-123',
          landParcelsForSbi: ['A1-111', 'A1-222']
        },
        `Land parcel doesn't belong to sbi=${TEST_SBI.DEFAULT} | selectedLandParcel: A1-123 | landParcelsForSbi=["A1-111","A1-222"]`
      ],
      [
        'API_REQUEST',
        'info',
        { endpoint: '/api/v2/parcels', url: 'https://land-grants-api/api/v2/parcels' },
        'Land Grants API request | endpoint: /api/v2/parcels | url: https://land-grants-api/api/v2/parcels'
      ],
      [
        'FARM_DETAILS_MISSING_FIELDS',
        'warn',
        { sbi: TEST_SBI.DEFAULT, missingFields: ['email', 'telephone'] },
        `Missing farm contact details for sbi: ${TEST_SBI.DEFAULT} | fields: email, telephone`
      ],
      [
        'FARM_DETAILS_MISSING_FIELDS with single field',
        'warn',
        { sbi: TEST_SBI.DEFAULT, missingFields: ['email'] },
        `Missing farm contact details for sbi: ${TEST_SBI.DEFAULT} | fields: email`
      ]
    ])
  })

  describe('AGREEMENTS log codes', () => {
    testLogCodes('AGREEMENTS', [
      [
        'AGREEMENT_LOAD',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, agreementType: TEST_AGREEMENT_TYPES.TERMS },
        `Agreement loaded for CRN=${TEST_USER_IDS.MASKED}, agreementType=${TEST_AGREEMENT_TYPES.TERMS}`
      ],
      [
        'AGREEMENT_ACCEPTED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, agreementType: TEST_AGREEMENT_TYPES.TERMS },
        `Agreement accepted by CRN=${TEST_USER_IDS.MASKED}, agreementType=${TEST_AGREEMENT_TYPES.TERMS}`
      ],
      [
        'AGREEMENT_ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Agreement processing error for CRN=${TEST_USER_IDS.MASKED}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      [
        'PROXY_RESPONSE_ERROR',
        'error',
        {},
        'Proxy response is undefined. Possible upstream error or misconfiguration.'
      ],
      [
        'CONTEXT_SBI_MISMATCH',
        'warn',
        { contextSbi: '106284736', authenticatedSbi: '106514040' },
        'Ignoring stored grant application context: context SBI=106284736 does not match authenticated SBI=106514040'
      ]
    ])
  })

  describe('APPLICATION_LOCKS log codes', () => {
    testLogCodes('APPLICATION_LOCKS', [
      [
        'RELEASE_SKIPPED',
        'debug',
        { ownerId: TEST_USER_IDS.DEFAULT, reason: 'no-owner' },
        `Application locks release skipped | CRN=${TEST_USER_IDS.MASKED} | reason=no-owner`
      ],
      [
        'RELEASE_ATTEMPTED',
        'debug',
        { ownerId: TEST_USER_IDS.DEFAULT },
        `Attempting application locks release | CRN=${TEST_USER_IDS.MASKED}`
      ],
      [
        'RELEASE_SUCCEEDED',
        'debug',
        { ownerId: TEST_USER_IDS.DEFAULT, releasedCount: 3 },
        `Application locks released | CRN=${TEST_USER_IDS.MASKED} | releasedCount=3`
      ],
      [
        'RELEASE_TIMEOUT',
        'warn',
        { ownerId: TEST_USER_IDS.DEFAULT, timeoutMs: 5000 },
        `Application locks release timed out | CRN=${TEST_USER_IDS.MASKED} | timeoutMs=5000`
      ],
      [
        'RELEASE_FAILED',
        'error',
        { ownerId: TEST_USER_IDS.DEFAULT, errorName: 'TimeoutError', errorMessage: 'connection lost' },
        `Failed to release application locks | CRN=${TEST_USER_IDS.MASKED} | errorName=TimeoutError | errorMessage=connection lost`
      ]
    ])
  })

  describe('WOODLAND log codes', () => {
    testLogCodes('WOODLAND', [
      [
        'VALIDATE_ERROR',
        'error',
        { errorMessage: 'Invalid woodland data' },
        'Woodland validation error: Invalid woodland data'
      ]
    ])
  })

  describe('COOKIES log codes', () => {
    testLogCodes('COOKIES', [
      [
        'PAGE_LOAD',
        'info',
        { returnUrl: '/dashboard', referer: 'http://example.com' },
        'Cookies page loaded: returnUrl=/dashboard, referer=http://example.com'
      ]
    ])
  })

  describe('RESOURCE_NOT_FOUND log codes', () => {
    testLogCodes('RESOURCE_NOT_FOUND', [
      [
        'FORM_NOT_FOUND',
        'info',
        {
          slug: 'test-form',
          userId: TEST_USER_IDS.DEFAULT,
          sbi: TEST_SBI.DEFAULT,
          reason: 'not_found',
          environment: 'production',
          referer: 'http://example.com'
        },
        `Form not found: slug=test-form, CRN=${TEST_USER_IDS.MASKED}, sbi=${TEST_SBI.DEFAULT}, reason=not_found, environment=production, referer=http://example.com`
      ],
      [
        'PAGE_NOT_FOUND',
        'info',
        {
          path: TEST_PATHS.TEST_PATH,
          userId: TEST_USER_IDS.DEFAULT,
          sbi: TEST_SBI.DEFAULT,
          referer: 'http://example.com',
          userAgent: 'Mozilla/5.0'
        },
        `Page not found: path=${TEST_PATHS.TEST_PATH}, CRN=${TEST_USER_IDS.MASKED}, sbi=${TEST_SBI.DEFAULT}, referer=http://example.com, userAgent=Mozilla/5.0`
      ],
      [
        'FORM_NOT_FOUND with fallbacks',
        'info',
        { slug: 'test-form' },
        'Form not found: slug=test-form, CRN=unknown, sbi=unknown, reason=not_found, environment=unknown, referer=none'
      ],
      [
        'PAGE_NOT_FOUND with fallbacks',
        'info',
        { path: TEST_PATHS.TEST_PATH },
        `Page not found: path=${TEST_PATHS.TEST_PATH}, CRN=unknown, sbi=unknown, referer=none, userAgent=unknown`
      ]
    ])
  })

  describe('PRINT_APPLICATION log codes', () => {
    testLogCodes('PRINT_APPLICATION', [
      [
        'SUCCESS',
        'info',
        { referenceNumber: TEST_REFERENCE_NUMBERS.REF_123 },
        `Print application viewed for referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}`
      ],
      [
        'ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, slug: 'test-slug', errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Print application error for CRN=${TEST_USER_IDS.MASKED}, slug=test-slug: ${TEST_ERRORS.PROCESSING_FAILED}`
      ]
    ])
  })

  describe('PERMISSIONS log codes', () => {
    testLogCodes('PERMISSIONS', [
      [
        'ACCESS_DENIED',
        'warn',
        {
          resource: 'csAgreements',
          permission: 'submit',
          userId: TEST_USER_IDS.DEFAULT,
          path: '/agreement/offer/accept',
          errorMessage: 'Insufficient permissions'
        },
        `Permission denied for resource=csAgreements, permission=submit, CRN=${TEST_USER_IDS.MASKED}, path=/agreement/offer/accept: Insufficient permissions`
      ],
      [
        'BYPASSED',
        'info',
        {
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          permission: 'submit',
          userId: TEST_USER_IDS.DEFAULT,
          authorised: true,
          path: 'test-start'
        },
        `Permission enforcement bypassed for grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}, permission=submit, CRN=${TEST_USER_IDS.MASKED}, authorised=true, path=test-start`
      ],
      [
        'SUCCESS',
        'info',
        {
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          permission: 'submit',
          userId: TEST_USER_IDS.DEFAULT,
          authorised: true,
          path: 'test-start'
        },
        `Permission check successful for grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}, permission=submit, CRN=${TEST_USER_IDS.MASKED}, authorised=true, path=test-start`
      ],
      [
        'FAILURE',
        'warn',
        {
          grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          permission: 'submit',
          userId: TEST_USER_IDS.DEFAULT,
          authorised: false,
          path: 'test-start'
        },
        `Permission check failed for grantCode=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}, permission=submit, CRN=${TEST_USER_IDS.MASKED}, authorised=false, path=test-start`
      ]
    ])
  })

  describe('PURGE log codes', () => {
    testLogCodes('PURGE', [
      [
        'STATE_CLEAR_SUCCESS',
        'info',
        {
          slug: 'test-grant'
        },
        'Purged application state cleared successfully for grant=test-grant'
      ],
      [
        'STATE_CLEAR_FAILURE',
        'warn',
        {
          slug: 'test-grant',
          errorMessage: 'Redis unavailable'
        },
        'Failed to clear purged application state for grant=test-grant, error=Redis unavailable'
      ]
    ])
  })
})
