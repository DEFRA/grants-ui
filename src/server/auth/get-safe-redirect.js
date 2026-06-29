/**
 * Return `redirect` if it is a same-origin relative path; otherwise '/home'.
 *
 * A leading `//` produces a protocol-relative URL that browsers treat as an
 * absolute external destination, so it must be rejected even though it starts
 * with '/'.
 *
 * @param {string | null | undefined} redirect
 * @returns {string}
 */
function getSafeRedirect(redirect) {
  if (!redirect?.startsWith('/') || redirect.startsWith('//')) {
    return '/home'
  }
  return redirect
}

export { getSafeRedirect }
