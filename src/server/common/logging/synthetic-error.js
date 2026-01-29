/**
 * Creates a synthetic Error object with a clean stack trace.
 *
 * @param {string} message
 * @returns {Error}
 */
export function syntheticError(message) {
  const err = new Error(message)
  Error.captureStackTrace(err, syntheticError)
  return err
}
