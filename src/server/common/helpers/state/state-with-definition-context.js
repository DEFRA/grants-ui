import { AsyncLocalStorage } from 'node:async_hooks'
import { config } from '~/src/config/config.js'
import { getCacheKey } from './get-cache-key-helper.js'
import { fetchStateWithDefinitionFromApi } from './fetch-saved-state-helper.js'
import { mintLockToken } from '../lock/lock-token.js'

/**
 * Per-request store holding the current Hapi `request`.
 *
 * The forms-engine-plugin resolves the form definition through a request-less
 * `formsService.getFormDefinition(id, state)` call, so backend-sourced forms
 * cannot otherwise reach `request.app`. An early Hapi extension binds this
 * context for the lifetime of the request so the definition path and `getState`
 * can both recover the live request via {@link currentRequest}.
 *
 * @type {AsyncLocalStorage<AnyRequest>}
 */
const requestStorage = new AsyncLocalStorage()

/**
 * Hapi's internal per-request lifecycle runners. Wrapping these guarantees the
 * request context is active for the whole request rather than just a single
 * extension's async subtree.
 */
const REQUEST_LIFECYCLE_METHODS = ['_lifecycle', '_postCycle']

/**
 * Binds the live `request` to the request context for the *entire* request, by
 * wrapping Hapi's internal lifecycle runners (`_lifecycle` and `_postCycle`) in
 * `requestStorage.run(request, ...)`. Intended to be called from an early
 * `onRequest` extension.
 *
 * This mirrors how `@defra/hapi-tracing` exposes its trace id and is far more
 * robust than entering the context from a later extension via `enterWith`:
 * `run()` establishes the store for the complete wrapped execution, so it is
 * present in every lifecycle step — route prerequisites, the handler and
 * `onPreResponse` — regardless of how Hapi schedules them.
 *
 * @param {AnyRequest} request
 * @returns {void}
 */
export function bindRequestContext(request) {
  const target = /** @type {Record<string, ((...args: unknown[]) => unknown) | undefined>} */ (
    /** @type {unknown} */ (request)
  )

  for (const method of REQUEST_LIFECYCLE_METHODS) {
    const original = target[method]
    if (typeof original !== 'function') {
      continue
    }

    const bound = original.bind(request)
    target[method] = (...args) => requestStorage.run(request, () => bound(...args))
  }
}

/**
 * Enters the request context for the remainder of the current async execution.
 * Prefer {@link bindRequestContext} from an `onRequest` extension; this remains
 * for callers that already own the current async scope.
 *
 * @param {AnyRequest} request
 * @returns {void}
 */
export function enterRequestContext(request) {
  requestStorage.enterWith(request)
}

/**
 * Runs `fn` inside the request context. Mainly useful for tests and for callers
 * that own the full async scope of the request.
 *
 * @template T
 * @param {AnyRequest} request
 * @param {() => T} fn
 * @returns {T}
 */
export function runWithRequest(request, fn) {
  return requestStorage.run(request, fn)
}

/**
 * @returns {AnyRequest | undefined} The current request, if a context is active
 */
export function currentRequest() {
  return requestStorage.getStore()
}

/**
 * Whether the given form slug should have its definition served from
 * grants-ui-backend (the combined endpoint) rather than from local YAML.
 *
 * @param {string} slug
 * @returns {boolean}
 */
export function isBackendSourcedSlug(slug) {
  const slugs = /** @type {string[]} */ (config.get('forms.backendFormDefEnabledSlugs')) ?? []
  return slugs.includes(slug)
}

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
    const { sbi, grantCode } = getCacheKey(request)
    const key = `${sbi}:${grantCode}`

    app.stateWithDefinition = fetchStateWithDefinitionFromApi(key, request, {
      lockToken: buildReadLockToken(request),
      includeDefinition: isBackendSourcedSlug(grantCode)
    })
  }

  return app.stateWithDefinition
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
