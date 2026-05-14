/**
 * Return `redirect` if it is a same-origin relative path; otherwise '/home'.
 * @param {string | null | undefined} redirect
 * @returns {string}
 */
function getSafeRedirect(redirect) {
  if (!redirect?.startsWith('/')) {
    return '/home'
  }
  return redirect
}

export { getSafeRedirect }
