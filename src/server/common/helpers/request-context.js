import { AsyncLocalStorage } from 'node:async_hooks'

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
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
