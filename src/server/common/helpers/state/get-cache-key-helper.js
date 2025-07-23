export const getCacheKey = (request) => {
  const { userId, businessId } = request.auth.credentials || {}

  const grantId = request.params?.slug

  if (!userId || !businessId) {
    throw new Error('Missing identity')
  }
  if (!grantId) {
    throw new Error('Missing grantId')
  }
  return { userId, businessId, grantId }
}
