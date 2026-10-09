const CONTROL_CHARACTERS = /\p{Cc}/u

/**
 * Whether `redirect` is a same-origin relative path.
 *
 * A second character of `/` or `\` produces a protocol-relative URL that
 * browsers normalise to an absolute external destination, so both must be
 * rejected even though the string starts with '/'.
 * e.g. `//evil.test`, `/\evil.test`, `///evil.test`
 *
 * @param {unknown} redirect
 * @returns {redirect is string}
 */
function isSafeRedirect(redirect) {
  return (
    typeof redirect === 'string' &&
    redirect.startsWith('/') &&
    redirect[1] !== '/' &&
    redirect[1] !== '\\' &&
    !CONTROL_CHARACTERS.test(redirect)
  )
}

/**
 * Return `redirect` if it is a same-origin relative path; otherwise '/home'.
 * See {@link isSafeRedirect}.
 *
 * @param {string | null | undefined} redirect
 * @returns {string}
 */
function getSafeRedirect(redirect) {
  if (redirect != null && typeof redirect !== 'string') {
    throw new TypeError(`getSafeRedirect: expected string, got ${typeof redirect}`)
  }
  return isSafeRedirect(redirect) ? redirect : '/home'
}

export { getSafeRedirect, isSafeRedirect }
