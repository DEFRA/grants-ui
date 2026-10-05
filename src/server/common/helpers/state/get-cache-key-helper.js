import { getGrantCode } from '../grant-code.js'
import { BaseError } from '../../utils/errors/BaseError.js'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../auth/get-auth-identifiers.js'
import { YarKeys } from '../../constants/session-keys.js'

/**
 * Generates a cache key from a Hapi request by extracting user, business, and grant identifiers.
 *
 * `referenceNumber` is read from `?ref=`, falling back to whatever is stored
 * in session. A pure read - storing/clearing is `multiApplicationRedirect`'s job.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request - The Hapi request object containing authentication credentials and route parameters.
 * @returns {{ sbi: string, grantCode: string, referenceNumber?: string }} An object containing identifiers to be used as a cache key.
 * @throws {Error} If authentication credentials, user ID, business relationship, or grant ID are missing or malformed.
 */
export const getCacheKey = (request) => {
  getAuthenticatedCrn(request)
  const sbi = getAuthenticatedSbi(request)

  const grantCode = getGrantCode(request)

  if (!grantCode) {
    throw BaseError.wrap(new Error('Missing grantCode'))
  }

  const queryRef = /** @type {string | undefined} */ (request.query?.ref) || undefined
  const referenceNumber = queryRef ?? readApplicationFromSession(request, grantCode)

  return referenceNumber ? { sbi, grantCode, referenceNumber } : { sbi, grantCode }
}

/**
 * Reads the session-stored `referenceNumber` for the given grant, if any.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @param {string} grantCode
 * @returns {string | undefined}
 */
function readApplicationFromSession(request, grantCode) {
  const stored = /** @type {{ grantCode?: string, referenceNumber?: string } | undefined} */ (
    request.yar?.get(YarKeys.APPLICATION_REF_NUMBER)
  )

  return stored?.grantCode === grantCode ? stored.referenceNumber : undefined
}

/**
 * Stores `referenceNumber` in session, scoped to `grantCode` so a second
 * multi-application grant in the same session can't pick up the wrong one.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @param {string} grantCode
 * @param {string} referenceNumber
 */
export function storeApplicationInSession(request, grantCode, referenceNumber) {
  request.yar?.set(YarKeys.APPLICATION_REF_NUMBER, { grantCode, referenceNumber })
}

/**
 * Clears the session-stored application, so a stale ref can't leak back in
 * on a later request that omits `?ref=`.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 */
export function clearApplicationFromSession(request) {
  request.yar?.clear(YarKeys.APPLICATION_REF_NUMBER)
}

/**
 * Builds the colon-separated session key string from its components.
 *
 * The single place that decides the wire format `parseSessionKey` reverses -
 * every construction site should go through this rather than interpolating
 * the string directly, so the two stay in lockstep.
 *
 * @param {{ sbi: string, grantCode: string, referenceNumber?: string }} params
 * @returns {string}
 */
export function buildSessionKey({ sbi, grantCode, referenceNumber }) {
  return referenceNumber ? `${sbi}:${grantCode}:${referenceNumber}` : `${sbi}:${grantCode}`
}

/**
 * Parses a session key into its components.
 *
 * Accepts two shapes: `sbi:grantCode` for the standard single-application
 * flow, and `sbi:grantCode:referenceNumber` for a multi-application grant
 * opened via `?ref=`. Any other segment count is rejected rather than
 * silently truncated, since a caller-supplied `referenceNumber` could
 * otherwise be mistaken for (or mask) a malformed key.
 *
 * @param {string} sessionKey - Colon-separated key (`sbi:grantCode` or `sbi:grantCode:referenceNumber`)
 * @returns {{ sbi: string, grantCode: string, referenceNumber?: string }} Parsed values
 * @throws {Error} If sessionKey is invalid or missing parts
 */
export function parseSessionKey(sessionKey) {
  if (!sessionKey || typeof sessionKey !== 'string') {
    throw BaseError.wrap(new Error('Invalid session key: must be a non-empty string'))
  }

  const MIN_SESSION_KEY_PARTS = 2
  const MAX_SESSION_KEY_PARTS = 3
  const parts = sessionKey.split(':')

  if (
    parts.length < MIN_SESSION_KEY_PARTS ||
    parts.length > MAX_SESSION_KEY_PARTS ||
    parts.some((part) => !part)
  ) {
    throw BaseError.wrap(new Error(`Invalid session key format: ${sessionKey}`))
  }

  const [sbi, grantCode, referenceNumber] = parts

  return referenceNumber ? { sbi, grantCode, referenceNumber } : { sbi, grantCode }
}
