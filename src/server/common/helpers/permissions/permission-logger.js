export function logPermissionEvent({ request, grantCode, permission, enforcementEnabled, authorised }) {
  const userId = request.auth.credentials?.contactId

  const event = {
    grantCode,
    permission,
    userId,
    enforcementEnabled,
    authorised
  }

  if (!enforcementEnabled) {
    request.logger.info(event, 'Permission enforcement bypassed')
    return
  }

  if (authorised) {
    request.logger.info(event, 'Permission check successful')
    return
  }

  request.logger.warn(event, 'Permission check failed')
}
