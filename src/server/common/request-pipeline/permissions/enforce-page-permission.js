import { getTaskListPath } from '~/src/server/task-list/task-list.helper.js'
import { ApplicationStatus } from '../../constants/application-status.js'
import { getPermissionResource, getRequiredPermission } from '../../helpers/permissions/page-permissions.js'
import { forbidden } from '@hapi/boom'
import { logPermissionEvent } from '../../helpers/permissions/permission-logger.js'
import { getGrantCode } from '../../helpers/grant-code.js'

/**
 * View-only pages that a view-only user may reach, mapped to the application
 * status the journey must be in before access is granted.
 *
 * The application journey confirmation/print pages require the application to be
 * `SUBMITTED`, whereas the claims journey `claim-confirmation` page mirrors that
 * behaviour keyed on `CLAIM_SUBMITTED` instead.
 */
const VIEW_ONLY_ALLOWED_PATHS = new Map([
  ['confirmation', ApplicationStatus.SUBMITTED],
  ['print-submitted-application', ApplicationStatus.SUBMITTED],
  ['claim-confirmation', ApplicationStatus.CLAIM_SUBMITTED]
])

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
 * Determines whether the current application is in the given submitted status.
 *
 * Defaults to the application-journey `SUBMITTED` status, but accepts an
 * explicit status so the claims journey can key its view-only access on
 * `CLAIM_SUBMITTED`.
 *
 * @param {FormContext} context - Request/context object containing application state.
 * @param {string} [expectedStatus] - The status to compare against.
 * @returns {boolean} True if the application matches the expected status.
 */
export function isSubmittedApplication(context, expectedStatus = ApplicationStatus.SUBMITTED) {
  const status = /** @type {{ applicationStatus?: string }} */ (context.state).applicationStatus

  return status === expectedStatus
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
 * Returns the application status a view-only path requires before access is
 * granted, or `undefined` when the path is not a view-only allowed path.
 *
 * @param {string} path - The request path to check.
 * @returns {string | undefined} The required application status.
 */
export function getRequiredStatusForViewOnlyPath(path) {
  return VIEW_ONLY_ALLOWED_PATHS.get(path)
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
  const requiredStatus = getRequiredStatusForViewOnlyPath(request.params.path)

  if (requiredStatus !== undefined && isSubmittedApplication(context, requiredStatus)) {
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
 * Maps a permission resource to the noun used in the "cannot submit" copy, so
 * claims journey pages say "claim" while the rest of the grant says
 * "application".
 */
const CANNOT_SUBMIT_NOUNS = new Map([
  ['csAgreements', 'claim'],
  ['csApplications', 'application']
])

/**
 * Gets the best default "return" URL for a form.
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
 * Resolves the "cannot submit" page content for the current request.
 *
 * The defaults are derived from the journey noun (claim vs application) so the
 * page works with zero extra config. Both the `pageTitle` and the single
 * `content` block can be overridden per resource via
 * `metadata.permissions.cannotSubmit.<resource>` in the form definition.
 *
 * The return button is resolved as follows:
 * - when there is no `cannotSubmit.<resource>` config block at all, the default
 *   return button is used (task list / summary / farm-payments exception);
 * - when a config block exists, the button is shown only if that block supplies
 *   both `returnUrl` and `returnText`.
 *
 * @param {import('../types.js').PipelineRequest} request - The Hapi request object.
 * @returns {{
 *   pageTitle: string,
 *   content: string,
 *   returnUrl?: string,
 *   returnText?: string
 * }} The resolved view content.
 */
export function getCannotSubmitContent(request) {
  const resource = getPermissionResource(request)
  const noun = CANNOT_SUBMIT_NOUNS.get(resource) ?? 'application'

  const defaults = {
    pageTitle: `You cannot submit this ${noun}`,
    content:
      '<p class="govuk-body">Your progress has been saved.</p>' +
      `<p class="govuk-body">You do not have permission to submit the ${noun}.</p>` +
      `<p class="govuk-body">Contact an authorised person from your business to review and submit the ${noun}.</p>`
  }

  const permissions =
    /** @type {{ cannotSubmit?: Record<string, Record<string, string>> } | undefined} */
    (request.app.model?.def?.metadata?.permissions)
  const configured = permissions?.cannotSubmit?.[resource]

  if (!configured) {
    const basePath = request.params?.slug ? `/${request.params.slug}` : ''
    const returnTo = getReturnToApplicationPath(request.app.model, basePath, request.params?.slug)

    return {
      ...defaults,
      returnUrl: returnTo.href,
      returnText: returnTo.text
    }
  }

  return { ...defaults, ...configured }
}

/**
 * Renders the "cannot submit" page in place for an amend-only user who hit a
 * submit action, keeping the URL on the blocked page and passing the content as
 * a proper view model (no redirect, no query params).
 * @param {import('../types.js').PipelineRequest} request - The Hapi request object.
 * @param {import('@hapi/hapi').ResponseToolkit} h - The Hapi response toolkit.
 * @returns {import('@hapi/hapi').Lifecycle.ReturnValue} A takeover view response.
 */
function renderCannotSubmit(request, h) {
  if (!request.app.model) {
    throw forbidden('Form model missing')
  }

  return h.view('cannot-submit', getCannotSubmitContent(request)).takeover()
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
    return renderCannotSubmit(request, h)
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
