import { config } from '~/src/config/config.js'
import { getClientIp } from '~/src/plugins/rate-limit.js'

// The FCP Audit schema caps `ip` at 20 chars and marks it required. IPv4 (max
// 15 chars) always fits whole, but a real IPv6 address is usually longer (a
// full address is 39 chars), so we truncate to the cap rather than blanking it.
// Dropping the IP would mean an empty/absent `ip`, which the required field
// rejects. That would silently lose the whole access event. Keeping the first
// 20 chars preserves the network prefix (the useful part for an audit trail)
// and lets the event publish.
const MAX_IP_LENGTH = 20

/**
 * Normalises a raw IP to a single schema-compliant address: keeps the first
 * entry, strips an IPv6 zone id (`fe80::1%eth0` -> `fe80::1`) and an IPv4
 * `:port`, and truncates to the schema's 20-char limit (see note above).
 * @param {string | undefined | null} raw
 * @returns {string}
 */
const sanitiseIp = (raw) => {
  if (!raw) {
    return ''
  }
  let ip = raw.split(',')[0].trim().split('%')[0]
  if ((ip.match(/:/g) ?? []).length === 1) {
    ip = ip.split(':')[0]
  }
  return ip.slice(0, MAX_IP_LENGTH)
}

/**
 * Maps the app's `cdpEnvironment` value to the FCP Audit schema's environment
 * vocabulary (e.g. `dev` -> `cdp-dev`). `local` is unchanged; unknown values
 * fall back to a `cdp-` prefix.
 * @param {string} cdpEnvironment
 * @returns {string}
 */
export const mapEnvironment = (cdpEnvironment) => {
  if (cdpEnvironment === 'local') {
    return 'local'
  }
  return `cdp-${cdpEnvironment}`
}

/**
 * Builds an FCP Audit event for a signed-in user successfully accessing a grant
 * page. Optional identity fields are only included when known so the publisher
 * doesn't receive `undefined` values.
 * @param {import('@hapi/hapi').Request} request
 * @returns {Record<string, unknown>}
 */
export const buildAuditEventForGrantAccess = (request) => {
  const credentials = request.auth.credentials
  const contactId = /** @type {string | undefined} */ (credentials.contactId)
  const sessionId = /** @type {string | undefined} */ (credentials.sessionId)
  const crn = /** @type {string | undefined} */ (credentials.crn)
  const sbi = /** @type {string | undefined} */ (credentials.sbi)
  const organisationId = /** @type {string | undefined} */ (credentials.organisationId)

  const correlationid = request.headers[config.get('tracing.header')]
  const ip = sanitiseIp(getClientIp(request.headers['x-forwarded-for']) || request.info.remoteAddress)

  /** @type {Record<string, string>} */
  const accounts = {}
  if (crn) {
    accounts.crn = crn
  }
  if (sbi) {
    accounts.sbi = sbi
  }
  if (organisationId) {
    accounts.organisationId = organisationId
  }

  /** @type {Record<string, unknown>} */
  const event = {
    datetime: new Date().toISOString(),
    ip,
    audit: {
      entities: [{ entity: 'application', action: 'read', entityid: request.params.slug }],
      status: 'success',
      ...(Object.keys(accounts).length > 0 && { accounts })
    }
  }

  if (contactId) {
    event.user = `IDM/${contactId}`
  }
  if (sessionId) {
    event.sessionid = sessionId
  }
  if (correlationid) {
    event.correlationid = correlationid
  }

  return event
}
