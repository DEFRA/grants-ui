export const getCacheKey = (request) => {
  const { id: userId, relationships } = request.auth.credentials || {}

  // Support single-business users for now
  const businessId = (Array.isArray(relationships) && relationships[0]?.split(':')[1]) || null

  const grantId = request.params?.slug

  if (!userId || !businessId) {
    throw new Error('Missing identity')
  }
  if (!grantId) {
    throw new Error('Missing grantId')
  }
  return { userId, businessId, grantId }
}
