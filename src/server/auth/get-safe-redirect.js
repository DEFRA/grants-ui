function getSafeRedirect(redirect) {
  if (!redirect?.startsWith('/')) {
    return '/home'
  }
  return redirect
}

export { getSafeRedirect }
