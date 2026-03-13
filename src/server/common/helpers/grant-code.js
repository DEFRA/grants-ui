import { BaseError } from '../utils/errors/BaseError.js'

/**
 * Returns the grantCode for the current request.
 * Throws an error if not found.
 *
 * @param {import('@hapi/hapi').Request} request - Hapi request object
 * @returns {string} - The grantCode
 */
export function getGrantCode(request) {
  const grantCode = request.params?.slug
  if (!grantCode) {
    throw BaseError.wrap(new Error('Missing grantCode'))
  }
  return grantCode
}
