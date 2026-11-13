// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

let publishUserRole
let initialiseUserRoleAnalytics

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  localStorage.clear()
  globalThis.dataLayer = []
  document.body.innerHTML =
    '<div id="user-role-analytics" data-role="Business Owner" data-context="opaque-a" data-consent="true"></div>'
  ;({ publishUserRole, initialiseUserRoleAnalytics } = await import('./user-role-analytics.js'))
})

describe('business role analytics', () => {
  it('sends the raw role once and restores it without an event on the next document', async () => {
    initialiseUserRoleAnalytics()
    publishUserRole()
    expect(globalThis.dataLayer).toEqual([{ event: 'user_role_loaded', userRole: 'Business Owner' }])

    vi.resetModules()
    globalThis.dataLayer = []
    const nextPage = await import('./user-role-analytics.js')
    nextPage.initialiseUserRoleAnalytics()
    expect(globalThis.dataLayer).toEqual([{ userRole: 'Business Owner' }])
  })

  it('does not repeat the role already seeded by the page template on refresh', () => {
    localStorage.setItem('grants-ui:user-role-context', 'opaque-a')
    globalThis.dataLayer = [{ userRole: 'Business Owner' }, { event: 'gtm.js' }]
    initialiseUserRoleAnalytics()
    expect(globalThis.dataLayer).toEqual([{ userRole: 'Business Owner' }, { event: 'gtm.js' }])
  })

  it('still sends the first named event when the template has seeded the role', () => {
    globalThis.dataLayer = [{ userRole: 'Business Owner' }]
    initialiseUserRoleAnalytics()
    expect(globalThis.dataLayer).toEqual([
      { userRole: 'Business Owner' },
      { event: 'user_role_loaded', userRole: 'Business Owner' }
    ])
  })

  it('sends again for a different business context or a new authenticated session', () => {
    publishUserRole()
    document.getElementById('user-role-analytics').dataset.context = 'opaque-b'
    document.getElementById('user-role-analytics').dataset.role = 'Agent'
    publishUserRole()
    expect(globalThis.dataLayer).toEqual([
      { event: 'user_role_loaded', userRole: 'Business Owner' },
      { event: 'user_role_loaded', userRole: 'Agent' }
    ])
  })

  it('waits for consent and can publish when consent is accepted later', () => {
    document.getElementById('user-role-analytics').dataset.consent = 'false'
    initialiseUserRoleAnalytics()
    expect(globalThis.dataLayer).toEqual([])
    publishUserRole()
    expect(globalThis.dataLayer).toHaveLength(1)
  })

  it('does nothing without an authenticated role', () => {
    document.body.innerHTML = ''
    expect(() => publishUserRole()).not.toThrow()
    expect(globalThis.dataLayer).toEqual([])
  })

  it('tolerates unavailable browser storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => publishUserRole()).not.toThrow()
    publishUserRole()
    expect(globalThis.dataLayer).toHaveLength(1)
  })
})
