import { getGrantCode } from '../grant-code.js'
import { BaseError } from '../../utils/errors/BaseError.js'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../auth/get-auth-identifiers.js'
import { YarKeys } from '../../constants/session-keys.js'

/**
 * Generates a cache key from a Hapi request by extracting user, business, and grant identifiers.
 *
 * `referenceNumber` resolves a multi-application grant's `?ref=` routing (see
 * the `?ref=` routing feature). This is a pure read: it never persists
 * anything to session (that is `multiApplicationRedirect`'s job, gated on
 * the grant's own `allowMultipleApplications` flag, so a single-application
 * grant's session/backend-call shape is never touched by this feature at
 * all) - it only reads whichever of these is present, in priority order:
 * - `?ref=` on the current request's URL.
 * - Otherwise, a value already persisted to session for the current
 *   `grantCode`, if one exists.
 * - It is omitted entirely for single-application requests (or once a
 *   persisted application is cleared, see {@link clearPersistedApplication}),
 *   which continue to resolve the one application for `(sbi, grantCode)`
 *   exactly as before.
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
  const referenceNumber = queryRef ?? readPersistedApplication(request, grantCode)

  return referenceNumber ? { sbi, grantCode, referenceNumber } : { sbi, grantCode }
}

/**
 * Reads the session-persisted `referenceNumber` for the given grant, if any.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @param {string} grantCode
 * @returns {string | undefined}
 */
function readPersistedApplication(request, grantCode) {
  const stored = /** @type {{ grantCode?: string, referenceNumber?: string } | undefined} */ (
    request.yar?.get(YarKeys.APPLICATION_REFERENCE_NUMBER)
  )

  return stored?.grantCode === grantCode ? stored.referenceNumber : undefined
}

/**
 * Persists `referenceNumber` to session, scoped to `grantCode` so a second
 * multi-application grant in the same session cannot pick up the wrong
 * application.
 *
 * Exported for callers that resolve a `referenceNumber` themselves rather
 * than reading it off `?ref=` (e.g. `multiApplicationRedirect` pinning the
 * sbi's one existing application as the active one, so the rest of the
 * journey behaves exactly as if `?ref=` had been supplied explicitly).
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @param {string} grantCode
 * @param {string} referenceNumber
 */
export function persistApplication(request, grantCode, referenceNumber) {
  request.yar?.set(YarKeys.APPLICATION_REFERENCE_NUMBER, { grantCode, referenceNumber })
}

/**
 * Clears the session-persisted application, if any. Called when the user
 * lands somewhere that means "which application this is isn't known" (e.g.
 * the applications list), so a stale reference from a previous application
 * cannot leak back in on the next request that omits `?ref=`.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 */
export function clearPersistedApplication(request) {
  request.yar?.clear(YarKeys.APPLICATION_REFERENCE_NUMBER)
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

  const parts = sessionKey.split(':')

  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !part)) {
    throw BaseError.wrap(new Error(`Invalid session key format: ${sessionKey}`))
  }

  const [sbi, grantCode, referenceNumber] = parts

  return referenceNumber ? { sbi, grantCode, referenceNumber } : { sbi, grantCode }
}
