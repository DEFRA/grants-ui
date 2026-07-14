import { inspect } from 'node:util'

/**
 * Runs `fn`, capturing a thrown error as a value instead of propagating it.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<Attempt<T>>}
 */
export async function attempt(fn) {
  try {
    return { ok: true, value: await fn() }
  } catch (error) {
    return { ok: false, error: asError(error) }
  }
}

/**
 * Synchronous counterpart to {@link attempt}.
 * @template T
 * @param {() => T} fn
 * @returns {Attempt<T>}
 */
export function attemptSync(fn) {
  try {
    return { ok: true, value: fn() }
  } catch (error) {
    return { ok: false, error: asError(error) }
  }
}

/**
 * A `throw` can carry any value, but every caller here wants a `.message`.
 * @param {unknown} error
 * @returns {Error}
 */
function asError(error) {
  if (error instanceof Error) {
    return error
  }
  return new Error(typeof error === 'string' ? error : inspect(error))
}

/**
 * @template T
 * @typedef {{ ok: true, value: T } | { ok: false, error: Error }} Attempt
 */
