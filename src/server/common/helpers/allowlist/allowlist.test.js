import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import allowlist from './allowlist.js'
import { mockHapiRequest, mockHapiResponseToolkit, mockHapiServer } from '~/src/__mocks__/hapi-mocks.js'
import { getAllForms } from '~/src/server/dev-tools/utils/index.js'
import { fetchAllowedGrants } from '~/src/server/auth/services/allowlist.client.js'

vi.mock('~/src/server/dev-tools/utils/index.js', () => ({ getAllForms: vi.fn() }))
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
    expect(getAllForms).not.toHaveBeenCalled()
  })

  it('falls back to slug when the form has no grantCode in metadata', async () => {
    const handler = registerAndGetHandler(server)
    getAllForms.mockReturnValue([{ slug: SLUG, metadata: {} }])
    fetchAllowedGrants.mockResolvedValue(['woodland'])

    const request = mockHapiRequest({
      params: { slug: SLUG },
      auth: { isAuthenticated: true, credentials: { crn: CRN, sbi: SBI } }
    })

    const result = await handler(request, h)

    expect(fetchAllowedGrants).toHaveBeenCalledWith(CRN, SBI)
    expect(result).toBe(h.continue)
  })

  it('redirects to unauthorised when the slug is not found in any form', async () => {
    const handler = registerAndGetHandler(server)
    getAllForms.mockReturnValue([{ slug: 'other-form', metadata: { submission: { grantCode: 'other' } } }])

    const request = mockHapiRequest({
      params: { slug: 'missing-form' },
      auth: { isAuthenticated: true, credentials: { crn: CRN, sbi: SBI } }
    })

    const result = await handler(request, h)

    expect(fetchAllowedGrants).not.toHaveBeenCalled()
    expect(h.redirect).toHaveBeenCalledWith('/auth/journey-unauthorised')
    expect(result).toBe(h)
  })

  it('continues when grantCode from metadata is in the allowed grants list', async () => {
    const handler = registerAndGetHandler(server)
    getAllForms.mockReturnValue([{ slug: SLUG, metadata: { submission: { grantCode: 'woodland' } } }])
    fetchAllowedGrants.mockResolvedValue(['woodland', 'farm-payments'])

    const request = mockHapiRequest({
      params: { slug: SLUG },
      auth: { isAuthenticated: true, credentials: { crn: CRN, sbi: SBI } }
    })

    const result = await handler(request, h)

    expect(fetchAllowedGrants).toHaveBeenCalledWith(CRN, SBI)
    expect(result).toBe(h.continue)
  })

  it('redirects to unauthorised when grantCode is not in the allowed grants list', async () => {
    const handler = registerAndGetHandler(server)
    getAllForms.mockReturnValue([{ slug: SLUG, metadata: { submission: { grantCode: 'woodland' } } }])
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
        details: expect.objectContaining({ reason: 'whitelist', grantCode: 'woodland' })
      })
    )
    expect(h.redirect).toHaveBeenCalledWith('/auth/journey-unauthorised')
    expect(result).toBe(h)
  })

  it('does not send an audit event when access is granted', async () => {
    const handler = registerAndGetHandler(server)
    getAllForms.mockReturnValue([{ slug: SLUG, metadata: { submission: { grantCode: 'woodland' } } }])
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
