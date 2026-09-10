import { vi } from 'vitest'
import { mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { getApplicationStatus } from '../../services/grant-application/grant-application.service.js'
import { getFormsCacheService } from '../../helpers/forms-cache/forms-cache.js'

const SUBMITTED = 'SUBMITTED'
const REOPENED = 'REOPENED'
const CONFIRMATION_PATH = '/confirmation'

export function setupRedirectTest() {
  vi.clearAllMocks()

  const mockCacheService = { setState: vi.fn() }
  getFormsCacheService.mockReturnValue(mockCacheService)

  const { request, h, context } = buildRedirectFixtures()

  return { request, h, context, mockCacheService }
}

export function mockGasStatus(status) {
  getApplicationStatus.mockResolvedValue({ json: async () => ({ status }) })
}

export function buildRedirectFixtures() {
  const request = {
    params: { slug: 'grant-a' },
    app: {
      model: {
        def: {
          metadata: {
            version: '1.0.0',
            submission: { grantCode: 'grant-a-code' },
            grantRedirectRules: {
              preSubmission: [{ toPath: '/check-selected-land-actions' }],
              postSubmission: [
                {
                  fromGrantsStatus: `${SUBMITTED},${REOPENED}`,
                  gasStatus: 'APPLICATION_WITHDRAWN',
                  toGrantsStatus: 'CLEARED',
                  toPath: '/start'
                },

                {
                  fromGrantsStatus: SUBMITTED,
                  gasStatus: 'APPLICATION_AMEND',
                  toGrantsStatus: REOPENED,
                  toPath: '/summary'
                },

                {
                  fromGrantsStatus: SUBMITTED,
                  gasStatus: 'OFFER_SENT,OFFER_WITHDRAWN,OFFER_ACCEPTED',
                  toGrantsStatus: SUBMITTED,
                  toPath: '/agreement'
                },

                {
                  fromGrantsStatus: REOPENED,
                  gasStatus: 'default',
                  toGrantsStatus: REOPENED,
                  toPath: '/summary'
                },

                {
                  fromGrantsStatus: SUBMITTED,
                  gasStatus: 'default',
                  toGrantsStatus: SUBMITTED,
                  toPath: CONFIRMATION_PATH
                },

                {
                  fromGrantsStatus: 'default',
                  gasStatus: 'default',
                  toGrantsStatus: SUBMITTED,
                  toPath: CONFIRMATION_PATH
                }
              ]
            }
          }
        }
      }
    },
    path: '/grant-a/start',
    headers: {},
    auth: { credentials: { sbi: '12345', crn: 'CRN123', contactId: 'contact-123' } },
    server: { logger: { error: vi.fn() } },
    yar: { set: vi.fn(), get: vi.fn(), clear: vi.fn() }
  }

  const h = mockHapiResponseToolkit()

  const context = {
    paths: ['/start', CONFIRMATION_PATH],
    referenceNumber: 'REF-001',
    state: { applicationStatus: SUBMITTED }
  }

  return { request, h, context }
}
