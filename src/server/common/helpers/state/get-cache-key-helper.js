export const getCacheKey = (request) => {
  const credentials = request.auth?.credentials

  if (!credentials) {
    throw new Error('Missing auth credentials')
  }
  const { id: userId, relationships } = credentials

  if (!userId) {
    throw new Error('Missing user ID in credentials')
  }

  // Support single-business users for now
  const businessId = (Array.isArray(relationships) && relationships[0]?.split(':')[1]) || null
  if (!businessId) {
    throw new Error(`Missing or malformed business relationship in credentials: ${JSON.stringify(relationships)}`)
  }

  const grantId = request.params?.slug
  if (!grantId) {
    throw new Error('Missing grantId')
  }
  return { userId, businessId, grantId }
}
