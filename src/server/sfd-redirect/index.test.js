import { describe, expect, it, vi } from 'vitest'
import { SFD_REDIRECT_PATH, SFD_REDIRECT_SESSION_KEY, sfdRedirect } from './index.js'

const { mockConfigGet } = vi.hoisted(() => ({ mockConfigGet: vi.fn() }))
vi.mock('~/src/config/config.js', () => ({
  config: { get: mockConfigGet }
}))

describe('sfdRedirect plugin', () => {
  it('builds the SFD URL with the current relationship ID', () => {
    mockConfigGet.mockReturnValue('https://sfd.example.com/update-sbi')
    const yar = {
      get: vi.fn().mockReturnValue({ returnPath: '/woodland/check-details' }),
      clear: vi.fn()
    }
    const h = {
      redirect: vi.fn((url) => ({ url })),
      view: vi.fn((view, context) => ({ view, context }))
    }
    const server = { route: vi.fn() }

    sfdRedirect.plugin.register(server)
    const route = server.route.mock.calls[0][0]
    const result = route.handler({ yar, auth: { credentials: { currentRelationshipId: 'REL123' } } }, h)

    expect(route).toMatchObject({ method: 'GET', path: SFD_REDIRECT_PATH })
    expect(yar.get).toHaveBeenCalledWith(SFD_REDIRECT_SESSION_KEY)
    expect(yar.clear).toHaveBeenCalledWith(SFD_REDIRECT_SESSION_KEY)
    expect(h.redirect).toHaveBeenCalledWith('https://sfd.example.com/update-sbi?ssoOrgId=REL123')
    expect(h.view).not.toHaveBeenCalled()
    expect(result).toEqual({ url: 'https://sfd.example.com/update-sbi?ssoOrgId=REL123' })
  })

  it('returns to the original path when the configured SFD URL is invalid', () => {
    mockConfigGet.mockReturnValue('not a URL')
    const yar = {
      get: vi.fn().mockReturnValue({ returnPath: '/woodland/check-details' }),
      clear: vi.fn()
    }
    const h = { redirect: vi.fn() }
    const server = { route: vi.fn() }

    sfdRedirect.plugin.register(server)
    const route = server.route.mock.calls[0][0]
    route.handler({ yar, auth: { credentials: { currentRelationshipId: 'REL123' } } }, h)

    expect(h.redirect).toHaveBeenCalledWith('/woodland/check-details')
    expect(yar.clear).toHaveBeenCalledWith(SFD_REDIRECT_SESSION_KEY)
  })
})
