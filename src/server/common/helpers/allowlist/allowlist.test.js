import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import allowlist from './allowlist.js'
import { config } from '~/src/config/config.js'
import { mockHapiRequest, mockHapiResponseToolkit, mockHapiServer } from '~/src/__mocks__/hapi-mocks.js'
import { fetchAllowedGrants } from '~/src/server/auth/services/allowlist.client.js'

vi.mock('~/src/config/config.js', () => ({ config: { get: vi.fn() } }))
vi.mock('~/src/server/auth/services/allowlist.client.js', () => ({ fetchAllowedGrants: vi.fn() }))
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({ log: vi.fn() }))
vi.mock('~/src/server/common/helpers/logging/log-codes.js', async () => {
  const { mockLogCodesHelper } = await import('~/src/__mocks__/index.js')
  return mockLogCodesHelper()
})

const CRN = '1101009926'
const SBI = '105123456'
const SLUG = 'woodland'

const registerAndGetHandler = (server) => {
  allowlist.plugin.register(server)
  return server.ext.mock.calls[0][1]
}

describe('allowlist plugin', () => {
  let server
  let h

  beforeEach(() => {
    vi.clearAllMocks()
    server = mockHapiServer()
    h = mockHapiResponseToolkit()
    config.get.mockReturnValue(['woodland'])
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('registers an onPostAuth extension', () => {
    allowlist.plugin.register(server)
    expect(server.ext).toHaveBeenCalledWith('onPostAuth', expect.any(Function))
  })

  it('continues when request is not authenticated', async () => {
    const handler = registerAndGetHandler(server)
    const request = mockHapiRequest({ auth: { isAuthenticated: false, credentials: {} } })

    const result = await handler(request, h)

    expect(result).toBe(h.continue)
    expect(fetchAllowedGrants).not.toHaveBeenCalled()
  })

  it('continues when authenticated but request has no slug (non-journey route)', async () => {
    const handler = registerAndGetHandler(server)
    const request = mockHapiRequest({
      params: {},
      auth: { isAuthenticated: true, credentials: { crn: CRN, sbi: SBI } }
    })

    const result = await handler(request, h)

    expect(result).toBe(h.continue)
    expect(fetchAllowedGrants).not.toHaveBeenCalled()
  })

  it('continues when the slug is not in backendAllowlistEnabledSlugs (falls back to whitelist)', async () => {
    const handler = registerAndGetHandler(server)
    config.get.mockReturnValue(['farm-payments'])

    const request = mockHapiRequest({
      params: { slug: SLUG },
      auth: { isAuthenticated: true, credentials: { crn: CRN, sbi: SBI } }
    })

    const result = await handler(request, h)

    expect(fetchAllowedGrants).not.toHaveBeenCalled()
    expect(result).toBe(h.continue)
  })

  it('continues when slug is in the allowed grants list', async () => {
    const handler = registerAndGetHandler(server)
    fetchAllowedGrants.mockResolvedValue(['woodland', 'farm-payments'])

    const request = mockHapiRequest({
      params: { slug: SLUG },
      auth: { isAuthenticated: true, credentials: { crn: CRN, sbi: SBI } }
    })

    const result = await handler(request, h)

    expect(fetchAllowedGrants).toHaveBeenCalledWith(CRN, SBI)
    expect(result).toBe(h.continue)
  })

  it('redirects to unauthorised when slug is not in the allowed grants list', async () => {
    const handler = registerAndGetHandler(server)
    fetchAllowedGrants.mockResolvedValue([])

    const sendAuditEvent = vi.fn().mockResolvedValue(undefined)
    const request = mockHapiRequest({
      params: { slug: SLUG },
      auth: { isAuthenticated: true, credentials: { crn: CRN, sbi: SBI } },
      sendAuditEvent
    })

    const result = await handler(request, h)

    expect(sendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'unauthorised',
        status: 'denied',
        details: expect.objectContaining({ reason: 'allowlist', grantCode: SLUG })
      })
    )
    expect(h.redirect).toHaveBeenCalledWith('/auth/journey-unauthorised')
    expect(result).toBe(h)
  })

  it('throws when the backend allowlist call fails (fail-closed)', async () => {
    const handler = registerAndGetHandler(server)
    fetchAllowedGrants.mockRejectedValue(new Error('backend down'))

    const request = mockHapiRequest({
      params: { slug: SLUG },
      auth: { isAuthenticated: true, credentials: { crn: CRN, sbi: SBI } }
    })

    await expect(handler(request, h)).rejects.toThrow('backend down')
  })

  it('does not send an audit event when access is granted', async () => {
    const handler = registerAndGetHandler(server)
    fetchAllowedGrants.mockResolvedValue(['woodland'])

    const sendAuditEvent = vi.fn()
    const request = mockHapiRequest({
      params: { slug: SLUG },
      auth: { isAuthenticated: true, credentials: { crn: CRN, sbi: SBI } },
      sendAuditEvent
    })

    await handler(request, h)

    expect(sendAuditEvent).not.toHaveBeenCalled()
  })
})
