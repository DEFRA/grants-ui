/**
 * Return `redirect` if it is a same-origin relative path; otherwise '/home'.
 *
 * A second character of `/` or `\` produces a protocol-relative URL that
 * browsers normalise to an absolute external destination, so both must be
 * rejected even though the string starts with '/'.
 * e.g. `//evil.test`, `/\evil.test`, `///evil.test`
 *
 * @param {string | null | undefined} redirect
 * @returns {string}
 */
function getSafeRedirect(redirect) {
  if (redirect != null && typeof redirect !== 'string') {
    throw new TypeError(`getSafeRedirect: expected string, got ${typeof redirect}`)
  }
  if (!redirect?.startsWith('/') || redirect[1] === '/' || redirect[1] === '\\') {
    return '/home'
  }
  return redirect
}

export { getSafeRedirect }
