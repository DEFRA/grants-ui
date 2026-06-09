import { getTaskListPath } from '~/src/server/task-list/task-list.helper.js'
import { ApplicationStatus } from '../../constants/application-status.js'
import { getPermissionResource, getRequiredPermission } from '../../helpers/permissions/page-permissions.js'
import { forbidden } from '@hapi/boom'
import { logPermissionEvent } from '../../helpers/permissions/permission-logger.js'
import { getGrantCode } from '../../helpers/grant-code.js'

/**
 * Determines whether the current user can amend an application
 * but is not permitted to submit it.
 *
 * Used to redirect amend-only users away from submit actions
 * to the "cannot submit" page.
 * @param {import('../types.js').PipelineRequest} request - The Hapi request object.
 * @param {string} requiredPermission - Required permission
 * @param {string} resource - The Hapi request object.
 * @returns {boolean} True if the user is view-only.
 */
export function isCannotSubmitUser(request, requiredPermission, resource) {
  const canAmend = request.can('amend', resource)
  const canSubmit = request.can('submit', resource)

  return requiredPermission === 'submit' && canAmend && !canSubmit
}

/**
 * Determines whether the current application has been submitted or reopened.
 *
 * @param {FormContext} context - Request/context object containing application state.
 * @returns {boolean} True if the application is submitted or reopened.
 */
export function isSubmittedApplication(context) {
  const status = /** @type {{ applicationStatus?: string }} */ (context.state).applicationStatus

  if (!status) {
    return false
  }

  return [ApplicationStatus.SUBMITTED, ApplicationStatus.REOPENED].includes(status)
}

/**
 * Determines whether a user has view-only access based on permissions.
 *
 * A view-only user can view applications but cannot amend or submit them.
 * @param {import('../types.js').PipelineRequest} request - The Hapi request object.
 * @param {string} resource - The Hapi request object.
 * @returns {boolean} True if the user is view-only.
 */
export function isViewOnlyUser(request, resource) {
  return request.can('view', resource) && !request.can('amend', resource) && !request.can('submit', resource)
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

/**
 * Enforces page-level application permissions for the current request.
 *
 * Permission enforcement is driven by the form definition metadata:
 *
 * - `metadata.permissions.enforce`
 * - `metadata.permissions.pageAccess`
 *
 * The required permission for the current page is resolved from the
 * configured page access rules for the current path.
 *
 * Behaviour:
 * - continues the request if permission enforcement is disabled
 * - continues the request if the user has the required permission
 * - redirects users with view-only access to the print application page
 * - returns a 403 response for unauthorised users
 *
 * This function must run after the DXT form model has been loaded onto
 * `request.app.model`.
 *
 * @param {import('../types.js').PipelineRequest} request - The Hapi request object.
 * @param {import('@hapi/hapi').ResponseToolkit} h - The Hapi response toolkit.
 * @param {FormContext} context - The context object which may contain form state
 * @returns {import('@hapi/hapi').Lifecycle.ReturnValue} A lifecycle response,
 * redirect, view response, or `h.continue`.
 */
export function enforcePagePermission(request, h, context) {
  const metadata =
    /** @type {{
     * permissions?: {
     *   enforce?: boolean
     * }
     * }} */
    (request.app.model?.def?.metadata)
  const config = metadata?.permissions
  const grantCode = getGrantCode(request)

  if (config?.enforce === false) {
    logPermissionEvent({
      request,
      grantCode,
      permission: 'n/a',
      enforcementEnabled: false,
      authorised: true
    })
    return h.continue
  }

  const resource = getPermissionResource(request)
  const requiredPermission = getRequiredPermission(request)

  const basePath = request.params.slug ? `/${request.params.slug}` : ''
  const model = request.app.model

  if (!model) {
    throw forbidden('Form model missing')
  }

  const log = (permission, authorised) =>
    logPermissionEvent({
      request,
      grantCode,
      permission,
      enforcementEnabled: true,
      authorised
    })

  // 1. view pages blocked before submission
  if (requiredPermission === 'view' && !isSubmittedApplication(context)) {
    log('view', false)
    throw forbidden('Application not submitted')
  }

  // 2. full permission granted
  if (request.can(requiredPermission, resource)) {
    log(requiredPermission, true)
    return h.continue
  }

  // 3. amend-only users trying submit -> cannot submit page
  if (isCannotSubmitUser(request, requiredPermission, resource)) {
    log(requiredPermission, false)

    const returnTo = getReturnToApplicationPath(model, basePath)

    const redirectUrl = `/cannot-submit?returnUrl=${encodeURIComponent(returnTo)}&returnText=${encodeURIComponent('Return to application')}`

    return h.redirect(redirectUrl).takeover()
  }

  // 4. view-only users post-submission -> go to confirmation
  if (isViewOnlyUser(request, resource) && isSubmittedApplication(context)) {
    log('view', false)
    return h.redirect(`${basePath}/confirmation`).takeover()
  }

  // 5. everything else
  log(requiredPermission, false)
  throw forbidden('Insufficient permissions')
}

/**
 * @import { type FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 */
