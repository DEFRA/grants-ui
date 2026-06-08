import { log, LogCodes } from '../logging/log.js'

export function logPermissionEvent({ request, grantCode, permission, enforcementEnabled, authorised }) {
  const logData = {
    userId: request.auth?.credentials?.contactId || 'unknown',
    grantCode,
    permission,
    authorised,
    path: request.params?.path
  }
  if (!enforcementEnabled) {
    log(LogCodes.PERMISSIONS.BYPASSED, logData, request)
    return
  }

  if (authorised) {
    log(LogCodes.PERMISSIONS.SUCCESS, logData, request)
    return
  }

  log(LogCodes.PERMISSIONS.FAILURE, logData, request)
}
