import { vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { getAgreementController } from './controller.js'
import { config } from '~/src/config/config.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { agreementsConfigValues } from '~/src/__mocks__/config-mocks.js'

vi.unmock('@hapi/jwt')

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigSimple } = await import('~/src/__mocks__')
  return mockConfigSimple()
})

vi.mock('~/src/server/common/helpers/logging/log-codes.js', async () => {
  const { mockLogCodesHelper } = await import('~/src/__mocks__')
  return mockLogCodesHelper()
})

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__/logger-mocks.js')
  return mockLogHelper()
})

const JWT_SECRET = 'test-jwt-secret'
const TTL_SEC = 300
const AUDIENCE = ['agreements-ui', 'gas']
const SBI = '106284736'

describe('agreements user context JWT - real signing', () => {
  let mockRequest
  let mockH

  const signedToken = async () => {
    await getAgreementController.handler(mockRequest, mockH)
    return mockH.proxy.mock.calls[0][0].mapUri().headers['x-encrypted-auth']
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockH = mockHapiResponseToolkit()
    mockH.proxy = vi.fn().mockReturnValue({ statusCode: 200 })

    mockRequest = mockHapiRequest({
      params: { path: 'offer' },
      method: 'GET',
      headers: {},
      auth: { isAuthenticated: true, credentials: { sbi: SBI, crn: 'CRN123' } },
      app: { cspNonce: 'test-nonce' },
      yar: { get: vi.fn().mockReturnValue({ grantCode: 'farm-payments', clientRef: 'sfi123456' }) }
    })

    config.get.mockImplementation(agreementsConfigValues())
  })

  test('signs a verifiable HS256 token carrying every expected claim', async () => {
    const token = await signedToken()

    expect(token).not.toBe('mocked-jwt-token')
    expect(jwt.decode(token, { complete: true }).header).toEqual({ alg: 'HS256', typ: 'JWT' })

    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'grants-ui', audience: 'gas' })

    expect(payload).toMatchObject({
      sub: 'CRN123',
      iss: 'grants-ui',
      aud: AUDIENCE,
      sbi: SBI,
      grantCode: 'farm-payments',
      clientRef: 'sfi123456',
      source: 'defra'
    })
    // aud must stay an array so a single token is accepted by both audiences.
    expect(Array.isArray(payload.aud)).toBe(true)
  })

  test('sets exp from the configured TTL rather than as a literal ttlSec claim', async () => {
    const payload = jwt.decode(await signedToken())

    expect(payload.exp).toBeDefined()
    expect(payload.exp - payload.iat).toBe(TTL_SEC)
    expect(payload).not.toHaveProperty('ttlSec')
  })

  test('rejects the token once it has expired', async () => {
    const token = await signedToken()

    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + (TTL_SEC + 1) * 1000)
      expect(() => jwt.verify(token, JWT_SECRET)).toThrow(jwt.TokenExpiredError)
    } finally {
      vi.useRealTimers()
    }
  })

  test('omits the grant application context when it is not yet in the session', async () => {
    mockRequest.yar.get.mockReturnValue(null)

    const payload = jwt.decode(await signedToken())

    expect(payload).not.toHaveProperty('grantCode')
    expect(payload).not.toHaveProperty('clientRef')
    expect(payload.sbi).toBe(SBI)
  })

  test.each([
    ['an object', { id: 'CRN123' }],
    ['an empty string', ''],
    ['null', null],
    ['absent', undefined]
  ])('omits sub when the CRN is %s', async (_label, crn) => {
    mockRequest.auth.credentials = { sbi: SBI, crn }

    const payload = jwt.decode(await signedToken())

    expect(payload).not.toHaveProperty('sub')
    expect(payload.sbi).toBe(SBI)
    expect(JSON.stringify(payload)).not.toContain('[object Object]')
  })

  test('stringifies a numeric CRN rather than dropping it', async () => {
    mockRequest.auth.credentials = { sbi: SBI, crn: 1100943757 }

    expect(jwt.decode(await signedToken()).sub).toBe('1100943757')
  })
})
