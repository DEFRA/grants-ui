import { describe, expect, it, vi } from 'vitest'
import { SFD_REDIRECT_PATH, SFD_REDIRECT_SESSION_KEY, sfdRedirect } from './index.js'

describe('sfdRedirect plugin', () => {
  it('redirects to the stored SFD URL and consumes it', () => {
    const redirectUrl = 'https://sfd.example.com/?ssoOrgId=REL123'
    const yar = {
      get: vi.fn().mockReturnValue(redirectUrl),
      clear: vi.fn()
    }
    const h = { redirect: vi.fn((url) => ({ url })) }
    const server = { route: vi.fn() }

    sfdRedirect.plugin.register(server)
    const route = server.route.mock.calls[0][0]
    const result = route.handler({ yar }, h)

    expect(route).toMatchObject({ method: 'GET', path: SFD_REDIRECT_PATH })
    expect(yar.get).toHaveBeenCalledWith(SFD_REDIRECT_SESSION_KEY)
    expect(yar.clear).toHaveBeenCalledWith(SFD_REDIRECT_SESSION_KEY)
    expect(h.redirect).toHaveBeenCalledWith(redirectUrl)
    expect(result).toEqual({ url: redirectUrl })
  })

  it('redirects home when no SFD URL is stored', () => {
    const yar = {
      get: vi.fn().mockReturnValue(undefined),
      clear: vi.fn()
    }
    const h = { redirect: vi.fn() }
    const server = { route: vi.fn() }

    sfdRedirect.plugin.register(server)
    const route = server.route.mock.calls[0][0]
    route.handler({ yar }, h)

    expect(h.redirect).toHaveBeenCalledWith('/')
    expect(yar.clear).toHaveBeenCalledWith(SFD_REDIRECT_SESSION_KEY)
  })
})
