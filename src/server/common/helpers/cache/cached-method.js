import { reach } from '@hapi/hoek'
import { config } from '~/src/config/config.js'

const SESSION_CACHE_NAME = 'session.cache.name'

const MS_PER_SECOND = 1000

// retry() defaults: 3 attempts, with 1s then 2s backoff between them.
const RETRY_ATTEMPTS = 3
const RETRY_BACKOFF_SECONDS = 3
const RETRY_BACKOFF_MS = RETRY_BACKOFF_SECONDS * MS_PER_SECOND

const UNRETRIED_GENERATE_TIMEOUT_SECONDS = 30
export const UNRETRIED_GENERATE_TIMEOUT_MS = UNRETRIED_GENERATE_TIMEOUT_SECONDS * MS_PER_SECOND

const GENERATE_TIMEOUT_HEADROOM_SECONDS = 5
export const GENERATE_TIMEOUT_HEADROOM_MS = GENERATE_TIMEOUT_HEADROOM_SECONDS * MS_PER_SECOND

/**
 * @param {number} attemptTimeoutMs - the `timeout` passed to retry()
 * @returns {number}
 */
export const retryWindowMs = (attemptTimeoutMs) => RETRY_ATTEMPTS * attemptTimeoutMs + RETRY_BACKOFF_MS

/**
 * Server method cached in the session cache (redis in CDP).
 * @template {unknown[]} A
 * @template R
 * @param {string} name
 * @param {(...args: A) => Promise<R>} fn
 * @param {object} options
 * @param {number} options.expiresIn
 * @param {number} options.generateTimeout - must exceed the upstream retry window
 * @param {(...args: any[]) => string} options.generateKey
 * @returns {CachedMethod<A, R>}
 */
export function defineCachedMethod(name, fn, { expiresIn, generateTimeout, generateKey }) {
  /** @type {CachedServerMethod<A, R> | null} */
  let method = null

  const registered = () => {
    if (!method) {
      throw new Error(`Cached method ${name} is not registered`)
    }
    return method
  }

  return {
    register(server) {
      server.method(name, fn, {
        cache: {
          cache: config.get(SESSION_CACHE_NAME),
          expiresIn,
          generateTimeout
        },
        generateKey
      })
      method = reach(server.methods, name)
    },
    call: (...args) => registered()(...args),
    drop: (...args) => registered().cache.drop(...args)
  }
}

/**
 * @template {unknown[]} A
 * @template R
 * @typedef {object} CachedMethod
 * @property {(server: Server) => void} register
 * @property {(...args: A) => Promise<R>} call
 * @property {(...args: Partial<A>) => Promise<void>} drop
 */

/**
 * @template {unknown[]} A
 * @template R
 * @typedef {((...args: A) => Promise<R>) & { cache: { drop: (...args: Partial<A>) => Promise<void> } }} CachedServerMethod
 */

/**
 * @typedef {object} CacheFlags
 * @property {number} [ttl]
 */

/**
 * @import { Server } from '@hapi/hapi'
 */
