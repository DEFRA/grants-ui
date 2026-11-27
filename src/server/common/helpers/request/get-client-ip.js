/** @param {string | string[] | undefined} xForwardedFor */
export const getClientIp = (xForwardedFor) => {
  if (!xForwardedFor) {
    return null
  }
  const headerValue = Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor
  return headerValue.split(',')[0].trim()
}
