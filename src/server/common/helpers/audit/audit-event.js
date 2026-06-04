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
 * Builds the schema's `accounts` block from whichever identity claims are
 * present on the credentials, omitting any that are missing so the publisher
 * never receives `undefined` values.
 * @param {Record<string, unknown>} credentials
 * @returns {Record<string, string>}
 */
const buildAccounts = (credentials) => {
  /** @type {Record<string, string>} */
  const accounts = {}
  for (const key of ['crn', 'sbi', 'organisationId']) {
    const value = credentials[key]
    if (value) {
      accounts[key] = /** @type {string} */ (value)
    }
  }
  return accounts
}

/**
 * @typedef {object} AuditEventOptions
 * @property {string} action - The verb describing what happened (e.g. `start`,
 *   `submit`, `resubmit`, `navigate`, `unauthorised`). Lowercased, max 120 chars.
 * @property {string} [entity] - The entity type. Defaults to `application`.
 * @property {string} [entityid] - The entity identifier. Defaults to the grant
 *   slug (`request.params.slug`).
 * @property {string} [status] - The outcome. Defaults to `success`.
 * @property {Record<string, unknown>} [details] - Free-form context for the
 *   schema's `audit.details` object (e.g. grant code, page path, denial reason,
 *   question/answer index).
 */

/**
 * Builds an FCP Audit event for a signed-in user's action against a grant.
 * The `action` (and optional `status`/`entityid`/`details`) describe what
 * happened; optional identity fields are only included when known so the
 * publisher doesn't receive `undefined` values.
 * @param {import('@hapi/hapi').Request} request
 * @param {AuditEventOptions} opts
 * @returns {Record<string, unknown>}
 */
export const buildAuditEvent = (request, { action, entity = 'application', entityid, status = 'success', details }) => {
  const credentials = request.auth.credentials
  const contactId = /** @type {string | undefined} */ (credentials.contactId)
  const sessionId = /** @type {string | undefined} */ (credentials.sessionId)

  const correlationid = request.headers[config.get('tracing.header')]
  const ip = sanitiseIp(getClientIp(request.headers['x-forwarded-for']) || request.info.remoteAddress)

  const accounts = buildAccounts(credentials)

  return {
    datetime: new Date().toISOString(),
    ip,
    audit: {
      entities: [{ entity, action, entityid: entityid ?? request.params.slug }],
      status,
      ...(Object.keys(accounts).length > 0 && { accounts }),
      ...(details && { details })
    },
    ...(contactId && { user: `IDM/${contactId}` }),
    ...(sessionId && { sessionid: sessionId }),
    ...(correlationid && { correlationid })
  }
}
