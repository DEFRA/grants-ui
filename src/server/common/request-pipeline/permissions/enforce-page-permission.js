import { getTaskListPath } from '~/src/server/task-list/task-list.helper.js'
import { ApplicationStatus } from '../../constants/application-status.js'
import { getPermissionResource, getRequiredPermission } from '../../helpers/permissions/page-permissions.js'
import { forbidden } from '@hapi/boom'
import { logPermissionEvent } from '../../helpers/permissions/permission-logger.js'
import { getGrantCode } from '../../helpers/grant-code.js'

const VIEW_ONLY_ALLOWED_PATHS = new Set(['confirmation', 'print-submitted-application'])

/**
 * Publishes an `unauthorised` audit event for an insufficient-permissions denial.
 * @param {import('../types.js').PipelineRequest} request - The Hapi request object.
 * @param {string} grantCode - The grant code for the denied page.
 * @param {string} permission - The permission the user lacked.
 * @returns {void}
 */
function auditPermissionDenied(request, grantCode, permission) {
  request.sendAuditEventInBackground({
    action: 'unauthorised',
    status: 'denied',
    details: { reason: 'permission', grantCode, permission }
  })
}

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
 * @param {string} [slug]
 * @returns {{ href: string, text: string }}
 */
export function getReturnToApplicationPath(model, basePath, slug) {
  const taskListPath = getTaskListPath(model)

  if (taskListPath) {
    return {
      href: `${basePath}${taskListPath}`,
      text: 'Return to task list'
    }
  }

  // Temporary exception for Farm Payments
  if (slug === 'farm-payments') {
    return {
      href: `${basePath}/check-selected-land-actions`,
      text: 'Return to summary'
    }
  }

  return {
    href: `${basePath}/summary`,
    text: 'Return to summary'
  }
}

/**
 * Checks whether a given path is allowed for view-only users.
 *
 * @param {string} path - The request path to check.
 * @returns {boolean} True if the path is allowed for view-only users.
 */
export function isAllowedViewOnlyPath(path) {
  return VIEW_ONLY_ALLOWED_PATHS.has(path)
}

/**
 * Handles a view-only user: allows the confirmation/print pages of a submitted
 * application through, otherwise logs the denial and throws 403.
 * @param {import('../types.js').PipelineRequest} request - The Hapi request object.
 * @param {import('@hapi/hapi').ResponseToolkit} h - The Hapi response toolkit.
 * @param {FormContext} context - The context object which may contain form state.
 * @param {string} grantCode - The grant code for logging/audit.
 * @returns {import('@hapi/hapi').Lifecycle.ReturnValue} `h.continue` when allowed.
 */
function handleViewOnlyUser(request, h, context, grantCode) {
  if (isSubmittedApplication(context) && isAllowedViewOnlyPath(request.params.path)) {
    logPermissionEvent({
      request,
      grantCode,
      permission: 'view',
      enforcementEnabled: true,
      authorised: true
    })
    return h.continue
  }
  logPermissionEvent({
    request,
    grantCode,
    permission: 'view',
    enforcementEnabled: true,
    authorised: false
  })
  auditPermissionDenied(request, grantCode, 'view')
  throw forbidden('Insufficient permissions')
}

/**
 * Builds the redirect that sends an amend-only user away from a submit action
 * to the "cannot submit" page, returning them to the application afterwards.
 * @param {import('../types.js').PipelineRequest} request - The Hapi request object.
 * @param {import('@hapi/hapi').ResponseToolkit} h - The Hapi response toolkit.
 * @returns {import('@hapi/hapi').Lifecycle.ReturnValue} A takeover redirect.
 */
function redirectCannotSubmitUser(request, h) {
  const basePath = request.params.slug ? `/${request.params.slug}` : ''
  const model = request.app.model
  if (!model) {
    throw forbidden('Form model missing')
  }
  const returnTo = getReturnToApplicationPath(model, basePath, request.params.slug)
  const redirectUrl = `/cannot-submit?returnUrl=${encodeURIComponent(returnTo.href)}&returnText=${encodeURIComponent(returnTo.text)}`
  return h.redirect(redirectUrl).takeover()
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
  // Enforcement only runs once permission config is present (see getPermissionResource,
  // which throws otherwise), so a required permission is always configured here.
  const requiredPermission = /** @type {string} */ (getRequiredPermission(request))

  if (isViewOnlyUser(request, resource)) {
    return handleViewOnlyUser(request, h, context, grantCode)
  }

  if (request.can(requiredPermission, resource)) {
    logPermissionEvent({
      request,
      grantCode,
      permission: requiredPermission,
      enforcementEnabled: true,
      authorised: true
    })

    return h.continue
  }

  if (isCannotSubmitUser(request, requiredPermission, resource)) {
    logPermissionEvent({
      request,
      grantCode,
      permission: requiredPermission,
      enforcementEnabled: true,
      authorised: false
    })
    return redirectCannotSubmitUser(request, h)
  }

  logPermissionEvent({
    request,
    grantCode,
    permission: requiredPermission,
    enforcementEnabled: true,
    authorised: false
  })

  auditPermissionDenied(request, grantCode, requiredPermission)
  throw forbidden('Insufficient permissions')
}

/**
 * @import { type FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 */
