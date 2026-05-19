import { getTaskListPath } from '~/src/server/task-list/task-list.helper.js'

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

export const requirePermission = ({ hasPermission, onFail }) => {
  return (request, h, context = {}) => {
    const permissions = request.auth.credentials.permissions || []

    if (hasPermission(permissions)) {
      return h.continue
    }

    return onFail(request, h, context)
  }
}
