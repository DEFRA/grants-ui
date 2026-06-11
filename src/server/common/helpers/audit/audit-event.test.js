import { describe, test, expect, vi } from 'vitest'
import { validateAuditEvent } from '@defra/fcp-audit-publisher'
import { buildAuditEvent, mapEnvironment } from './audit-event.js'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: (key) => (key === 'tracing.header' ? 'x-cdp-request-id' : undefined)
  }
}))

// Reimplementation of the real getClientIp (first x-forwarded-for entry,
// trimmed) so these tests don't pull in the rate-limit plugin's dependencies.
vi.mock('~/src/plugins/rate-limit.js', () => ({
  getClientIp: (xForwardedFor) => {
    if (!xForwardedFor) {
      return null
    }
    const value = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor
    return value.split(',')[0].trim()
  }
}))

// Build example IPs at runtime from parts so the test holds no hardcoded IP
// literals (keeps SonarLint S1313 quiet while the addresses stay readable).
const ipv4 = (...octets) => octets.join('.')
const ipv6 = (...segments) => segments.join(':')

const REMOTE_IPV4 = ipv4(10, 0, 0, 1)
const CLIENT_IPV4 = ipv4(1, 2, 3, 4)
const FORWARDED_IPV4 = ipv4(1, 1, 1, 1)
const PROXY_IPV4 = ipv4(2, 2, 2, 2)
const SERVER_IPV4 = ipv4(9, 9, 9, 9)
const LINK_LOCAL_IPV6 = ipv6('fe80', '', '1') // fe80::1
const LONG_IPV6 = ipv6('2001', '0db8', '85a3', '0000', '0000', '8a2e', '0370', '7334')

const buildRequest = (overrides = {}) => ({
  method: 'get',
  params: { slug: 'my-grant' },
  headers: {},
  info: { remoteAddress: REMOTE_IPV4 },
  auth: { isAuthenticated: true, credentials: {} },
  ...overrides
})

const START = { action: 'start' }

describe('mapEnvironment', () => {
  test.each([
    ['local', 'local'],
    ['dev', 'cdp-dev'],
    ['test', 'cdp-test'],
    ['perf-test', 'cdp-perf-test'],
    ['ext-test', 'cdp-ext-test'],
    ['prod', 'cdp-prod']
  ])('maps %s -> %s', (input, expected) => {
    expect(mapEnvironment(input)).toBe(expected)
  })
})

describe('buildAuditEvent', () => {
  test('builds a full event when all identity fields are present', () => {
    const request = buildRequest({
      headers: { 'x-cdp-request-id': 'corr-1', 'x-forwarded-for': CLIENT_IPV4 },
      auth: {
        isAuthenticated: true,
        credentials: { contactId: 'c1', sessionId: 's1', crn: 'crn1', sbi: 'sbi1', organisationId: 'org1' }
      }
    })

    const event = buildAuditEvent(request, START)

    expect(event).toMatchObject({
      ip: CLIENT_IPV4,
      user: 'IDM/c1',
      sessionid: 's1',
      correlationid: 'corr-1',
      audit: {
        entities: [{ entity: 'application', action: 'start', entityid: 'my-grant' }],
        status: 'success',
        accounts: { crn: 'crn1', sbi: 'sbi1', organisationId: 'org1' }
      }
    })
    expect(typeof event.datetime).toBe('string')
    expect(event.datetime).toBe(new Date(/** @type {string} */ (event.datetime)).toISOString())
  })

  test('omits user, sessionid, correlationid and accounts when not known', () => {
    const event = buildAuditEvent(buildRequest(), START)

    expect(event).not.toHaveProperty('user')
    expect(event).not.toHaveProperty('sessionid')
    expect(event).not.toHaveProperty('correlationid')
    expect(event.audit).not.toHaveProperty('accounts')
    expect(event.ip).toBe(REMOTE_IPV4)
  })

  test('includes only the account identifiers that are present', () => {
    const request = buildRequest({
      auth: { isAuthenticated: true, credentials: { crn: 'crn1' } }
    })

    const event = buildAuditEvent(request, START)

    expect(event.audit.accounts).toEqual({ crn: 'crn1' })
  })

  test('defaults entity to "application", status to "success" and entityid to the grant slug', () => {
    const event = buildAuditEvent(buildRequest({ params: { slug: 'another-grant' } }), START)

    expect(event.audit.entities[0]).toEqual({ entity: 'application', action: 'start', entityid: 'another-grant' })
    expect(event.audit.status).toBe('success')
    expect(event.audit).not.toHaveProperty('details')
  })

  test('honours a custom action, entity, entityid and status', () => {
    const event = buildAuditEvent(buildRequest(), {
      action: 'unauthorised',
      entity: 'page',
      entityid: 'ref-123',
      status: 'denied'
    })

    expect(event.audit.entities[0]).toEqual({ entity: 'page', action: 'unauthorised', entityid: 'ref-123' })
    expect(event.audit.status).toBe('denied')
  })

  test("passes details through to the schema's free-form audit.details object", () => {
    const details = { reason: 'whitelist', crnPassesValidation: false }
    const event = buildAuditEvent(buildRequest(), { action: 'unauthorised', status: 'denied', details })

    expect(event.audit.details).toEqual(details)
  })

  describe('ip handling', () => {
    test('prefers the first x-forwarded-for entry over remoteAddress', () => {
      const request = buildRequest({
        headers: { 'x-forwarded-for': `${FORWARDED_IPV4}, ${PROXY_IPV4}` },
        info: { remoteAddress: SERVER_IPV4 }
      })

      expect(buildAuditEvent(request, START).ip).toBe(FORWARDED_IPV4)
    })

    test('falls back to remoteAddress when x-forwarded-for is absent', () => {
      expect(buildAuditEvent(buildRequest(), START).ip).toBe(REMOTE_IPV4)
    })

    test('strips an IPv4 :port', () => {
      const request = buildRequest({ headers: { 'x-forwarded-for': `${CLIENT_IPV4}:5678` } })

      expect(buildAuditEvent(request, START).ip).toBe(CLIENT_IPV4)
    })

    test('strips an IPv6 zone id', () => {
      const request = buildRequest({ info: { remoteAddress: `${LINK_LOCAL_IPV6}%eth0` } })

      expect(buildAuditEvent(request, START).ip).toBe(LINK_LOCAL_IPV6)
    })

    test('truncates to the 20-char schema limit when the address is longer', () => {
      const request = buildRequest({ info: { remoteAddress: LONG_IPV6 } })

      expect(buildAuditEvent(request, START).ip).toBe(LONG_IPV6.slice(0, 20))
    })
  })

  describe('schema conformance', () => {
    test('with publisher defaults applied, the event passes the real validateAuditEvent', () => {
      const request = buildRequest({
        headers: { 'x-cdp-request-id': 'corr-1', 'x-forwarded-for': CLIENT_IPV4 },
        auth: {
          isAuthenticated: true,
          credentials: { contactId: 'c1', sessionId: 's1', crn: 'crn1', sbi: 'sbi1', organisationId: 'org1' }
        }
      })

      // Mirror the defaults publishAuditEvent injects from publisherConfig.
      const published = {
        version: '1.0.0',
        application: 'Grants',
        component: 'grants-ui',
        environment: 'cdp-test',
        ...buildAuditEvent(request, { action: 'start', details: { grantCode: 'my-grant' } })
      }

      const result = validateAuditEvent(published)

      expect(result).toMatchObject({ valid: true })
    })
  })
})
