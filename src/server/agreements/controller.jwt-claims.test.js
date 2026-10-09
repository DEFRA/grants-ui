import { vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { getAgreementController } from './controller.js'
import { listApplicationsFromApi } from '~/src/server/common/helpers/state/fetch-saved-state-helper.js'
import { config } from '~/src/config/config.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { agreementsConfigValues } from '~/src/__mocks__/config-mocks.js'

vi.unmock('@hapi/jwt')

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigSimple } = await import('~/src/__mocks__')
  return mockConfigSimple()
})

vi.mock('~/src/server/common/helpers/state/fetch-saved-state-helper.js', () => ({
  listApplicationsFromApi: vi.fn()
}))

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
      yar: { get: vi.fn().mockReturnValue({ grantCode: 'farm-payments', clientRef: 'sfi123456' }), set: vi.fn() }
    })

    config.get.mockImplementation(agreementsConfigValues())
    listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'GLD-ABC-123', grantVersion: '1.0.0' }])
  })

  test("a ?ref= on the URL names this tab's application, so two tabs on two applications do not share one", async () => {
    mockRequest.query = { ref: 'GLD-ABC-123' }

    const payload = jwt.decode(await signedToken())

    expect(listApplicationsFromApi).toHaveBeenCalledWith({ crn: 'CRN123', sbi: SBI, grantCode: 'farm-payments' })
    expect(payload.clientRef).toBe('gld-abc-123')
    expect(payload.grantCode).toBe('farm-payments')
  })

  test('the accepted URL context is stored in the session, so the agreements requests that follow (no query) act on the same application', async () => {
    mockRequest.query = { grant: 'woodland', ref: 'GLD-ABC-123' }

    await signedToken()

    expect(mockRequest.yar.set).toHaveBeenCalledWith('grantApplicationContext', {
      grantCode: 'woodland',
      grantVersion: '1.0.0',
      clientRef: 'gld-abc-123',
      sbi: SBI,
      applicationRef: 'GLD-ABC-123'
    })
  })

  test('a ?grant= with the ref names the grant the application is looked up under', async () => {
    mockRequest.query = { grant: 'woodland', ref: 'GLD-ABC-123' }

    const payload = jwt.decode(await signedToken())

    expect(listApplicationsFromApi).toHaveBeenCalledWith(expect.objectContaining({ grantCode: 'woodland' }))
    expect(payload.grantCode).toBe('woodland')
    expect(payload.clientRef).toBe('gld-abc-123')
  })

  test("a ref that is not one of this business's applications is rejected with a 404 rather than falling back to the stored (possibly another tab's) application", async () => {
    listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'GLD-SOMEONE-ELSE', grantVersion: '1.0.0' }])
    mockRequest.query = { ref: 'GLD-ABC-123' }

    // Thrown, so Hapi renders the standard 404 page rather than the upstream-error JSON.
    await expect(getAgreementController.handler(mockRequest, mockH)).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 404 }
    })

    expect(mockH.proxy).not.toHaveBeenCalled()
    expect(mockRequest.yar.set).not.toHaveBeenCalled()
  })

  test('when the applications list cannot be fetched the request fails instead of using the stored context', async () => {
    listApplicationsFromApi.mockRejectedValue(new Error('backend down'))
    mockRequest.query = { ref: 'GLD-ABC-123' }

    await getAgreementController.handler(mockRequest, mockH)

    expect(mockH.proxy).not.toHaveBeenCalled()
    expect(mockH.code).toHaveBeenCalledWith(503)
    expect(mockRequest.yar.set).not.toHaveBeenCalled()
  })

  test('a ?grant= without a ref changes nothing', async () => {
    mockRequest.query = { grant: 'woodland' }

    const payload = jwt.decode(await signedToken())

    expect(listApplicationsFromApi).not.toHaveBeenCalled()
    expect(payload.grantCode).toBe('farm-payments')
    expect(payload.clientRef).toBe('sfi123456')
  })

  test('single application: the grant the redirect puts on the URL matches the stored one, so the token is unchanged', async () => {
    mockRequest.query = {}
    const before = jwt.decode(await signedToken())

    mockRequest.query = { grant: 'farm-payments' }
    const after = jwt.decode(await signedToken())

    expect(after.grantCode).toBe(before.grantCode)
    expect(after.clientRef).toBe(before.clientRef)
    expect(after.sbi).toBe(before.sbi)
  })

  test('ignores a ?grant= that is not a grant code and looks the ref up under the stored grant', async () => {
    mockRequest.query = { grant: 'not a code!', ref: 'GLD-ABC-123' }

    const payload = jwt.decode(await signedToken())

    expect(listApplicationsFromApi).toHaveBeenCalledWith(expect.objectContaining({ grantCode: 'farm-payments' }))
    expect(payload.grantCode).toBe('farm-payments')
  })

  test('without a ?ref= the stored clientRef is used', async () => {
    mockRequest.query = {}

    const payload = jwt.decode(await signedToken())

    expect(payload.clientRef).toBe('sfi123456')
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

  test('forwards the grant application context when its stored SBI matches the authenticated SBI', async () => {
    mockRequest.yar.get.mockReturnValue({ grantCode: 'farm-payments', clientRef: 'sfi123456', sbi: SBI })

    const payload = jwt.decode(await signedToken())

    expect(payload.grantCode).toBe('farm-payments')
    expect(payload.clientRef).toBe('sfi123456')
    expect(payload.sbi).toBe(SBI)
  })

  test('drops a stale grant application context whose stored SBI is for a different business', async () => {
    mockRequest.yar.get.mockReturnValue({ grantCode: 'farm-payments', clientRef: 'sfi123456', sbi: '999999999' })

    const payload = jwt.decode(await signedToken())

    expect(payload).not.toHaveProperty('grantCode')
    expect(payload).not.toHaveProperty('clientRef')
    expect(payload.sbi).toBe(SBI)
  })

  test('forwards a legacy grant application context that has no stored SBI', async () => {
    mockRequest.yar.get.mockReturnValue({ grantCode: 'farm-payments', clientRef: 'sfi123456' })

    const payload = jwt.decode(await signedToken())

    expect(payload.grantCode).toBe('farm-payments')
    expect(payload.clientRef).toBe('sfi123456')
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
