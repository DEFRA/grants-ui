import { ApplicationStatus } from '../common/constants/application-status.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { updateApplicationStatus } from '../common/helpers/status/update-application-status-helper.js'
import { getApplicationStatus } from '../common/services/grant-application/grant-application.service.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import agreements from '~/src/config/agreements.js'

/**
 * @typedef {Object} RedirectRule
 * @property {string} fromGrantsStatus - Grants UI status or comma-separated statuses or 'default'
 * @property {string} gasStatus - GAS status or 'default'
 * @property {string} toGrantsStatus - Grants UI status to update to
 * @property {string} toPath - URL path to redirect the user to
 */

/**
 * Finds the first redirect rule that matches the given Grants UI status
 * and GAS (Grant Administration System) status.
 *
 * If a rule uses 'default', it matches any status for that field.
 *
 * @param {string} fromGrantsStatus - Current status in the Grants UI (previous state)
 * @param {string} gasStatus - Current status returned from GAS
 * @param {RedirectRule[]} redirectRules - Array of redirect rule objects to match against
 * @returns {RedirectRule} The first matching redirect rule
 * @throws {Error} If no matching rule is found
 *
 * @example
 * const rule = mapStatusToUrl('SUBMITTED', 'AWAITING_AMENDMENTS', redirectRules);
 * console.log(rule.toPath); // e.g., '/summary'
 */
function mapStatusToUrl(fromGrantsStatus, gasStatus, redirectRules = []) {
  const match = redirectRules.find((rule) => {
    const fromStatuses = new Set((rule.fromGrantsStatus || 'default').split(',').map((s) => s.trim()))
    const gasStatuses = new Set((rule.gasStatus || 'default').split(',').map((s) => s.trim()))

    const fromMatch = fromStatuses.has(fromGrantsStatus) || fromStatuses.has('default')
    const gasMatch = gasStatuses.has(gasStatus) || gasStatuses.has('default')

    return fromMatch && gasMatch
  })

  if (!match) {
    throw new Error(`No redirect rule found for fromGrantsStatus=${fromGrantsStatus} gasStatus=${gasStatus}`)
  }

  return match
}

/**
 * Persists the new status to the appropriate storage
 * Uses cache service for CLEARED status, otherwise updates application status
 * @param {object} request - The Hapi request object
 * @param {string} newStatus - The new status to persist
 * @param {string} previousStatus - The previous status for comparison
 * @param {string} grantId - The grant ID
 * @returns {Promise<void>}
 */
async function persistStatus(request, newStatus, previousStatus, grantId) {
  if (newStatus === previousStatus) {
    return
  }

  const organisationId = request.auth.credentials?.sbi
  if (newStatus === 'CLEARED') {
    const cacheService = getFormsCacheService(request.server)
    await cacheService.setState(request, {
      applicationStatus: ApplicationStatus.CLEARED
    })
  } else {
    await updateApplicationStatus(newStatus, `${organisationId}:${grantId}`)
  }
}

/**
 * Determines if the request should continue without redirecting
 * Handles special cases where status has already been transitioned
 * @param {string} gasStatus - The status from GAS API
 * @param {string} newStatus - The new Grants UI status
 * @param {string} previousStatus - The previous Grants UI status
 * @returns {boolean} True if request should continue without redirect
 */
function shouldContinueDefault(gasStatus, newStatus, previousStatus) {
  return (
    (gasStatus === 'AWAITING_AMENDMENTS' && newStatus === 'REOPENED' && previousStatus !== 'SUBMITTED') ||
    (gasStatus === 'APPLICATION_WITHDRAWN' &&
      newStatus === 'CLEARED' &&
      !['SUBMITTED', 'REOPENED'].includes(previousStatus))
  )
}

/**
 * Determines if the state contains any meaningful values other than the base keys.
 * @param state - The state object to check
 * @returns {boolean} - True if state contains meaningful values, otherwise false
 */
function hasMeaningfulState(state) {
  const baseStateKeys = new Set(['$$__referenceNumber', 'applicationStatus', 'applicant'])

  // TODO remove workaround for state clearing bug when SFIR-647 and SFIR-648 are complete
  const farmPaymentsStateKeys = new Set(['selectedLandParcel', 'payment', 'draftApplicationAnnualTotalPence'])
  for (const key of farmPaymentsStateKeys) {
    baseStateKeys.add(key)
  }
  if (!Object.keys(state.landParcels || {}).length) {
    baseStateKeys.add('landParcels')
  }
  // end workaround

  return Object.keys(state).some((k) => !baseStateKeys.has(k))
}

/**
 * Determines if the current request is for the start page of a grant.
 * @param request - The Hapi request object
 * @param context - The context object containing paths and state
 * @returns {boolean} - True if the current request is for the start page of a grant, otherwise false
 */
function isFormsStartPage(request, context) {
  const slug = request.params?.slug
  const startPath = context.paths?.[0]
  const currentPath = request.path

  if (!slug || !startPath) {
    return false
  }

  return currentPath === `/${slug}${startPath}`
}

/**
 * Determines if the current request is for a tasklist page.
 * @param request - The Hapi request object
 * @returns {boolean} - True if the current request is for a tasklist page, otherwise false
 */
function isTasklistPage(request) {
  return request.app.model?.def?.metadata?.tasklistId != null
}

/**
 * Determines if a pre-submission request should redirect to the "check answers" page.
 *
 * If there is any meaningful state and the user has navigated to the "start" page, redirect to the "check answers" page
 * Otherwise just continue
 *
 * Tasklist journeys are not supported currently
 *
 * @param request - Hapi request object
 * @param h - Hapi response toolkit
 * @param context - { paths: ['/start'], state: { applicationStatus: 'CLEARED' } }
 * @returns {Symbol} - Symbol.for('continue') if no redirect is required, otherwise Symbol.for('redirect')
 */
function preSubmissionRedirect(request, h, context) {
  const grantId = request.params?.slug
  const grantRedirectRules = request.app.model?.def?.metadata?.grantRedirectRules
  const preSubmissionRedirectRule = grantRedirectRules.preSubmission[0]
  const preSubmissionRedirectUrl = preSubmissionRedirectRule.toPath.startsWith('/')
    ? `/${grantId}${preSubmissionRedirectRule.toPath}`
    : `/${grantId}/${preSubmissionRedirectRule.toPath}`

  if (hasMeaningfulState(context.state) && isFormsStartPage(request, context) && !isTasklistPage(request)) {
    return h.redirect(preSubmissionRedirectUrl).takeover()
  }
  return h.continue
}

/**
 * Determines whether the pre-submission redirect logic should run.
 *
 * @param {string | undefined} previousStatus - The previous application status stored in the session or state.
 * @returns {boolean} `true` if the application has no previous status or was cleared/reopened, otherwise `false`.
 */
function shouldHandlePreSubmission(previousStatus) {
  return (
    !previousStatus || previousStatus === ApplicationStatus.CLEARED || previousStatus === ApplicationStatus.REOPENED
  )
}

/**
 * Builds a redirect URL for a given grant ID and path.
 *
 * @param {string} grantId - The unique identifier (slug) of the grant.
 * @param {string} path - The redirect path defined in the grant redirect rules.
 * @returns {string} A formatted URL combining the grant ID and path.
 *
 * @example
 * buildRedirectUrl('grant-a', '/summary') // "/grant-a/summary"
 * buildRedirectUrl('grant-a', 'summary')  // "/grant-a/summary"
 */
function buildRedirectUrl(grantId, path) {
  return path.startsWith('/') ? `/${grantId}${path}` : `/${grantId}/${path}`
}

/**
 * Handles post-submission redirects and status updates after a form has been submitted.
 *
 * @async
 * @param {import('@hapi/hapi').Request} request - The Hapi request object.
 * @param {import('@hapi/hapi').ResponseToolkit} h - The Hapi response toolkit.
 * @param {object} context - The request context containing state and reference data.
 * @param {string} previousStatus - The previous application status (e.g. "SUBMITTED").
 * @param {string} grantCode - The grant code used to fetch status from GAS.
 * @param {object} [grantRedirectRules] - The redirect rules configuration from metadata.
 * @returns {Promise<import('@hapi/hapi').ResponseObject | symbol>} A redirect or `h.continue`.
 *
 * @throws {Error} If GAS returns an unexpected response or no redirect rule matches.
 */
async function handlePostSubmission(request, h, context, previousStatus, grantCode, grantRedirectRules) {
  const grantId = request.params?.slug
  const response = await getApplicationStatus(grantCode, context.referenceNumber.toLowerCase())
  const { status: gasStatus } = await response.json()

  const postSubmissionRules = grantRedirectRules?.postSubmission ?? []
  const rule = mapStatusToUrl(previousStatus, gasStatus, postSubmissionRules)

  await persistStatus(request, rule.toGrantsStatus, previousStatus, grantId)

  if (shouldContinueDefault(gasStatus, rule.toGrantsStatus, previousStatus)) {
    return h.continue
  }

  const redirectUrl = rule.toPath === agreements.get('baseUrl') ? rule.toPath : buildRedirectUrl(grantId, rule.toPath)
  return request.path === redirectUrl ? h.continue : h.redirect(redirectUrl).takeover()
}

/**
 * Handles errors that occur during post-submission redirect processing.
 * Falls back to a default redirect rule if available.
 *
 * @param {Error & { status?: number }} err - The error thrown during post-submission handling.
 * @param {import('@hapi/hapi').Request} request - The Hapi request object.
 * @param {import('@hapi/hapi').ResponseToolkit} h - The Hapi response toolkit.
 * @param {object} context - The request context containing state and reference data.
 * @param {string} grantId - The grant slug identifying the grant type.
 * @param {string} grantCode - The grant code used in GAS lookups.
 * @param {object} [grantRedirectRules] - The redirect rules configuration from metadata.
 * @returns {import('@hapi/hapi').ResponseObject | symbol} A fallback redirect or `h.continue`.
 */
function handlePostSubmissionError(err, request, h, context, grantId, grantCode, grantRedirectRules) {
  if (err.status === statusCodes.notFound) {
    return h.continue
  }

  log(
    LogCodes.SUBMISSION.SUBMISSION_REDIRECT_FAILURE,
    {
      grantType: grantCode,
      referenceNumber: context.referenceNumber,
      error: err.message
    },
    request
  )

  const fallbackRule = mapStatusToUrl('default', 'default', grantRedirectRules?.postSubmission ?? [])
  const fallbackUrl = buildRedirectUrl(grantId, fallbackRule.toPath)

  return request.path === fallbackUrl ? h.continue : h.redirect(fallbackUrl).takeover()
}

/**
 * @typedef {object} GrantModel
 * @property {{ submission: { grantCode: string }, grantRedirectRules?: object }} metadata
 */

/**
 * @typedef {import('@hapi/hapi').Request & { app: { model?: { def?: GrantModel } } }} ExtendedRequest
 */

/**
 * Retrieves the grantCode from the request metadata.
 * Throws an error if not found.
 * @param {ExtendedRequest} request - Hapi request object
 * @returns {string} - The grantCode
 */
function getGrantCode(request) {
  // grantCode should always be available in the configured metadata
  const grantCode = request.app.model?.def?.metadata?.submission?.grantCode
  if (!grantCode) {
    throw new Error('grantCode missing from request.app.model.def.metadata.submission')
  }
  return grantCode
}

/**
 * Main callback for handling form status transitions.
 *
 * @param {ExtendedRequest} request - Hapi request object (extended to include app.model)
 * @param {import('@hapi/hapi').ResponseToolkit} h - Hapi response toolkit
 * @param {object} context - Current page context including form state and reference number
 * @returns {Promise<import('@hapi/hapi').ResponseObject | any>} Hapi response or continue symbol
 */
export const formsStatusCallback = async (request, h, context) => {
  const grantId = request.params?.slug
  if (!grantId) {
    return h.continue
  }

  const grantCode = getGrantCode(request)

  const previousStatus = context.state.applicationStatus
  const grantRedirectRules = request.app.model?.def?.metadata?.grantRedirectRules

  if (shouldHandlePreSubmission(previousStatus)) {
    return preSubmissionRedirect(request, h, context)
  }

  if (previousStatus !== 'SUBMITTED') {
    return h.continue
  }

  try {
    return await handlePostSubmission(request, h, context, previousStatus, grantCode, grantRedirectRules)
  } catch (err) {
    return handlePostSubmissionError(err, request, h, context, grantId, grantCode, grantRedirectRules)
  }
}
