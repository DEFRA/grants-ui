import { getGrantCode } from '../grant-code.js'
import { BaseError } from '../../utils/errors/BaseError.js'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../auth/get-auth-identifiers.js'

/**
 * Generates a cache key from a Hapi request by extracting user, business, and grant identifiers.
 *
 * `referenceNumber` comes from the request (see {@link getApplicationRef}),
 * never from session: a session is shared across tabs, so two applications
 * open at once would overwrite each other.
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

  const referenceNumber = getApplicationRef(request)

  return { sbi, grantCode, referenceNumber }
}

/**
 * The application reference this request is for. The multi-application
 * plugin moves it from `request.query.ref` to `request.app.applicationRef`
 * in `onPreHandler`, so both places are checked.
 *
 * @param {{ app?: unknown, query?: unknown }} request
 * @returns {string | undefined}
 */
export function getApplicationRef(request) {
  const app = /** @type {{ applicationRef?: unknown } | undefined} */ (request.app)
  const stashed = app?.applicationRef

  if (typeof stashed === 'string' && stashed) {
    return stashed
  }

  const query = /** @type {{ ref?: unknown } | undefined} */ (request.query)
  const fromQuery = query?.ref

  return typeof fromQuery === 'string' && fromQuery ? fromQuery : undefined
}

/**
 * Re-scopes the request to another application (or none): updates the stash,
 * drops `ref` from the query and forgets the memoised state envelope.
 *
 * @param {{ app?: unknown, query?: unknown }} request
 * @param {string} [ref]
 */
export function setApplicationRef(request, ref) {
  const mutableRequest = /** @type {{ query?: Record<string, unknown>, app: Record<string, unknown> }} */ (
    /** @type {unknown} */ (request)
  )
  mutableRequest.app ??= {}

  if (ref) {
    mutableRequest.app.applicationRef = ref
  } else {
    delete mutableRequest.app.applicationRef
  }

  if (mutableRequest.query && 'ref' in mutableRequest.query) {
    mutableRequest.query = { ...mutableRequest.query }
    delete mutableRequest.query.ref
  }

  delete mutableRequest.app.stateWithDefinition
}

/**
 * Appends the request's ref to a URL, keeping its query and fragment as they
 * are. A `ref` already on the target wins.
 *
 * @param {Parameters<typeof getApplicationRef>[0]} request
 * @param {string} url
 * @returns {string}
 */
export function withApplicationRef(request, url) {
  const ref = getApplicationRef(request)

  if (!ref) {
    return url
  }

  const hashIndex = url.indexOf('#')
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex)
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex)

  const queryIndex = beforeHash.indexOf('?')
  const path = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1)

  if (new URLSearchParams(query).has('ref')) {
    return url
  }

  const params = query ? `${query}&` : ''
  const refParam = new URLSearchParams({ ref }).toString()

  return `${path}?${params}${refParam}${hash}`
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

  if (parts.length < MIN_SESSION_KEY_PARTS || parts.length > MAX_SESSION_KEY_PARTS || parts.some((part) => !part)) {
    throw BaseError.wrap(new Error(`Invalid session key format: ${sessionKey}`))
  }

  const [sbi, grantCode, referenceNumber] = parts

  return referenceNumber ? { sbi, grantCode, referenceNumber } : { sbi, grantCode }
}
