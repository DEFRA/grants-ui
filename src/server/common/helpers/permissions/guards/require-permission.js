import { getTaskListPath } from '~/src/server/task-list/task-list.helper.js'
import { isPermissionEnforced } from '../permission-config.js'
import { getGrantCode } from '../../grant-code.js'
import { logPermissionEvent } from '../permission-logger.js'

export const permissionPaths = {
  cannotSubmit: '/cannot-submit'
}

/**
 * Gets the best "return" URL for a form.
 * Falls back to check responses if no task list exists.
 * @param {object} model
 * @param {string} basePath
 * @returns {string}
 */
export function getReturnToApplicationPath(model, basePath) {
  const taskListPath = getTaskListPath(model)

  if (taskListPath) {
    return `${basePath}${taskListPath}`
  }

  return `${basePath}/summary`
}

export const requirePermission = ({ permission, isAuthorised, onFail }) => {
  return (request, h, context = {}) => {
    if (!isPermissionEnforced(request)) {
      logPermissionEvent({
        request,
        grantCode: getGrantCode(request),
        permission,
        enforcementEnabled: false,
        authorised: true
      })
      return h.continue
    }
    const permissions = request.auth.credentials.permissions || []
    const authorised = isAuthorised(permissions)
    logPermissionEvent({
      request,
      grantCode: getGrantCode(request),
      permission,
      enforcementEnabled: true,
      authorised
    })
    if (authorised) {
      return h.continue
    }

    return onFail(request, h, context)
  }
}
