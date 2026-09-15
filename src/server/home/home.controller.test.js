import { beforeEach, describe, expect, test, vi } from 'vitest'

import { configState, mockHapiResponseToolkit, mockSimpleRequest } from '~/src/__mocks__'
import { fetchAllowedGrantDetails } from '~/src/server/auth/services/allowlist.client.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { homeController, indexController } from './home.controller.js'

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigWithState } = await import('~/src/__mocks__/config-mocks.js')
  return mockConfigWithState({
    defaults: {
      'externalLinks.sfd.enabled': false,
      'externalLinks.sfd.homeUrl': 'https://sfd.example/home'
    }
  })
})

vi.mock('~/src/server/auth/services/allowlist.client.js', () => ({
  fetchAllowedGrantDetails: vi.fn()
}))

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__/logger-mocks.js')
  return mockLogHelper()
})

describe('homeController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configState.reset()
  })

  test('renders the allowlisted active grants alphabetically', async () => {
    fetchAllowedGrantDetails.mockResolvedValue([
      { code: 'woodland', title: 'Woodland grant', description: 'Manage woodland', url: 'https://other/woodland' },
      { code: 'farm-payments', title: 'Farm payments', description: null, url: null }
    ])
    const request = mockSimpleRequest({
      auth: {
        isAuthenticated: true,
        credentials: { crn: '1100000001', sbi: '106000001', organisationName: 'Test Farm' }
      }
    })
    const h = mockHapiResponseToolkit()

    await homeController.handler(request, h)

    expect(fetchAllowedGrantDetails).toHaveBeenCalledWith('1100000001', '106000001')
    expect(h.view).toHaveBeenCalledWith('home', {
      pageTitle: 'Grants available to you',
      organisationName: 'Test Farm',
      grants: [
        { title: 'Farm payments', description: null, href: '/farm-payments' },
        { title: 'Woodland grant', description: 'Manage woodland', href: '/woodland' }
      ]
    })
  })

  test('renders the no-grants state when the user has no allowlisted active grants', async () => {
    fetchAllowedGrantDetails.mockResolvedValue([])
    const request = mockSimpleRequest({
      auth: { isAuthenticated: true, credentials: { crn: '1100000001', sbi: '106000001' } }
    })
    const h = mockHapiResponseToolkit()

    await homeController.handler(request, h)

    expect(h.view).toHaveBeenCalledWith('home', {
      pageTitle: 'Grants available to you',
      organisationName: undefined,
      grants: []
    })
  })

  test('does not treat an allowlist service failure as an empty list', async () => {
    fetchAllowedGrantDetails.mockRejectedValue(new Error('backend unavailable'))
    const request = mockSimpleRequest({
      auth: { isAuthenticated: true, credentials: { crn: '1100000001', sbi: '106000001' } }
    })
    const h = mockHapiResponseToolkit()

    await expect(homeController.handler(request, h)).rejects.toThrow('backend unavailable')
    expect(h.view).not.toHaveBeenCalled()
  })

  test('redirects to the SFD homepage when SFD is enabled', async () => {
    configState.set('externalLinks.sfd.enabled', true)
    const request = mockSimpleRequest()
    const h = mockHapiResponseToolkit()

    await homeController.handler(request, h)

    expect(h.redirect).toHaveBeenCalledWith('https://sfd.example/home')
    expect(fetchAllowedGrantDetails).not.toHaveBeenCalled()
    expect(h.view).not.toHaveBeenCalled()
  })

  test.each(['', 'not a URL', 'javascript:alert(1)'])(
    'falls back to the tactical page when the SFD homepage URL is invalid: %s',
    async (homeUrl) => {
      configState.set('externalLinks.sfd.enabled', true)
      configState.set('externalLinks.sfd.homeUrl', homeUrl)
      fetchAllowedGrantDetails.mockResolvedValue([])
      const request = mockSimpleRequest({
        auth: { isAuthenticated: true, credentials: { crn: '1100000001', sbi: '106000001' } }
      })
      const h = mockHapiResponseToolkit()

      await homeController.handler(request, h)

      expect(h.redirect).not.toHaveBeenCalled()
      expect(h.view).toHaveBeenCalledWith('home', expect.objectContaining({ grants: [] }))
      expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.SFD_HOME_URL_MISSING_ON_REDIRECT, { homeUrl }, request)
    }
  )
})

describe('indexController', () => {
  test('redirects an authenticated user to the authenticated home route', () => {
    const request = mockSimpleRequest({ auth: { isAuthenticated: true, credentials: {} } })
    const h = mockHapiResponseToolkit()

    indexController.handler(request, h)

    expect(h.redirect).toHaveBeenCalledWith('/home')
    expect(h.view).not.toHaveBeenCalled()
  })

  test('renders the sign-in page for an unauthenticated user', () => {
    const request = mockSimpleRequest({ auth: { isAuthenticated: false, credentials: null } })
    const h = mockHapiResponseToolkit()

    indexController.handler(request, h)

    expect(h.view).toHaveBeenCalledWith('root', { pageTitle: 'Index', heading: 'Index' })
    expect(h.redirect).not.toHaveBeenCalled()
  })
})
