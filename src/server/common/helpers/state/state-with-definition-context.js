import { rememberMultipleApplications } from '../definition/multiple-applications-cache.js'
import { getCacheKey, buildSessionKey } from './get-cache-key-helper.js'
import { fetchStateWithDefinitionFromApi } from './fetch-saved-state-helper.js'
import { mintLockToken } from '../lock/lock-token.js'
export { bindRequestContext, currentRequest, enterRequestContext, runWithRequest } from '../request-context.js'

/**
 * Builds the read lock token for the combined endpoint. Unlike save/clear
 * tokens it omits `grantVersion` (the backend resolves the active version and
 * validates the token with `requireGrantVersion: false`), so the cold first
 * read works before any version is known.
 *
 * @param {AnyRequest} request
 * @returns {string}
 */
function buildReadLockToken(request) {
  const { sbi, grantCode } = getCacheKey(request)
  const contactId = request.auth?.credentials?.contactId

  if (!contactId) {
    throw new Error('Missing user identity for lock token')
  }

  return mintLockToken({ userId: String(contactId), sbi, grantCode })
}

/**
 * Fetches the combined `{ definition, state, upgraded, ... }` envelope from the
 * backend exactly once per request, memoising the in-flight promise on
 * `request.app.stateWithDefinition`. Concurrent callers within the same request
 * (the definition-load path and `getState`) share the single network call.
 *
 * @param {AnyRequest} request
 * @returns {Promise<StateWithDefinitionEnvelope | null>}
 */
export function getStateWithDefinition(request) {
  const app = /** @type {{ stateWithDefinition?: Promise<StateWithDefinitionEnvelope | null> }} */ (request.app)

  if (!app.stateWithDefinition) {
    const cacheKey = getCacheKey(request)
    const key = buildSessionKey(cacheKey)

    app.stateWithDefinition = fetchStateWithDefinitionFromApi(key, request, {
      lockToken: buildReadLockToken(request)
    }).then((envelope) => {
      rememberMultipleApplications(cacheKey.grantCode, envelope?.definition)
      return envelope
    })
  }

  return app.stateWithDefinition
}

/**
 * Whether the backend stores this application's document keyed by its
 * reference (it marks such documents `allowMultipleApplications`), as opposed
 * to the single document per grant version of a standard grant.
 *
 * @param {AnyRequest} request
 * @returns {Promise<boolean>}
 */
export async function isStoredByReference(request) {
  return (await getStateWithDefinition(request))?.state?.allowMultipleApplications === true
}

/**
 * Resolves the grant version the backend used, from the combined envelope:
 * the upgraded `toVersion`, else the persisted `state.grantVersion`, else the
 * semver derived from the returned `definition`.
 *
 * @param {StateWithDefinitionEnvelope | null | undefined} body
 * @returns {string | undefined}
 */
export function resolveVersion(body) {
  if (body?.upgraded && body.toVersion) {
    return body.toVersion
  }

  // The persisted version lives on the top level of the full state document,
  // not on the nested form state (`state.state`).
  const stateVersion = body?.state?.grantVersion
  if (stateVersion) {
    return stateVersion
  }

  // The version components live on the top level of the full definition
  // document, alongside the nested form definition (`definition.definition`).
  const definition = body?.definition
  return definition ? `${definition.major}.${definition.minor}.${definition.patch}` : undefined
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { StateWithDefinitionEnvelope } from './fetch-saved-state-helper.js'
 */
