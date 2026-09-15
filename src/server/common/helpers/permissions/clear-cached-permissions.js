/**
 * Clears only the signed-in user's permissions for their current business.
 * @param {import('@hapi/hapi').Request} request
 */
export function clearCachedPermissions(request) {
  const { crn, sbi } = request.auth.credentials ?? {}
  if (crn && sbi) {
    request.yar?.clear(`permissions:${crn}:${sbi}`)
  }
}
