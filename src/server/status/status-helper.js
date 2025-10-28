import { ApplicationStatus } from '../common/constants/application-status.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { updateApplicationStatus } from '../common/helpers/status/update-application-status-helper.js'
import { getApplicationStatus } from '../common/services/grant-application/grant-application.service.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import agreements from '../../config/agreements.js'
import { shouldRedirectToAgreements } from '../common/helpers/agreements-redirect-helper.js'

const gasToGrantsUiStatus = {
  RECEIVED: 'SUBMITTED',
  AWAITING_AMENDMENTS: 'REOPENED', // first visit post-submission -> re-opened
  APPLICATION_WITHDRAWN: 'CLEARED',
  OFFER_SENT: 'SUBMITTED',
  OFFER_WITHDRAWN: 'SUBMITTED',
  OFFER_ACCEPTED: 'SUBMITTED'
}

/**
 * Maps GAS status and Grants UI status to the appropriate redirect URL
 * @param {string} gasStatus - The status from GAS API (e.g., 'RECEIVED', 'OFFER_SENT')
 * @param {string} grantsUiStatus - The current Grants UI status (e.g., 'SUBMITTED', 'REOPENED')
 * @param {string} slug - The grant slug/ID
 * @returns {string} The URL path to redirect to
 */
function mapStatusToUrl(gasStatus, grantsUiStatus, slug, redirectRules = []) {
  if (shouldRedirectToAgreements(slug, gasStatus)) {
    return agreements.get('baseUrl')
  }
  const match =
    redirectRules.find(
      (rule) =>
        (rule.fromGrantsStatus === grantsUiStatus || rule.fromGrantsStatus === 'default') &&
        (rule.gasStatus === gasStatus || rule.gasStatus === 'default')
    ) || redirectRules.find((r) => r.fromGrantsStatus === 'default' && r.gasStatus === 'default')

  const path = match?.toPath ?? '/confirmation'
  return `/${slug}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Determines the new Grants UI status based on GAS status and previous status
 * Handles special case where AWAITING_AMENDMENTS transitions SUBMITTED to REOPENED
 * @param {string} gasStatus - The status from GAS API
 * @param {string} previousStatus - The previous Grants UI status
 * @returns {string} The new Grants UI status
 */
function getNewStatus(gasStatus, previousStatus) {
  if (gasStatus === 'AWAITING_AMENDMENTS' && previousStatus === 'SUBMITTED') {
    return 'REOPENED'
  }
  return gasToGrantsUiStatus[gasStatus] ?? 'SUBMITTED'
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
  const baseStateKeys = new Set(['$$__referenceNumber', 'applicationStatus'])
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
  // TODO refactor to use config driven approach in TGC-903
  const isFarmPayments = request.params?.slug === 'farm-payments'
  const redirectUrl = isFarmPayments ? 'check-selected-land-actions' : 'summary'

  if (hasMeaningfulState(context.state) && isFormsStartPage(request, context) && !isTasklistPage(request)) {
    return h.redirect(redirectUrl).takeover()
  }
  return h.continue
}

// higher-order callback that wraps the existing one
export const formsStatusCallback = async (request, h, context) => {
  const grantId = request.params?.slug
  // grantCode should always be available in the config
  const grantCode = request.app.model?.def?.metadata?.submission.grantCode

  if (!grantId) {
    return h.continue
  }

  const previousStatus = context.state.applicationStatus
  const grantRedirectRules = request.app.model?.def?.metadata?.grantRedirectRules

  if (
    !previousStatus ||
    previousStatus === ApplicationStatus.CLEARED ||
    previousStatus === ApplicationStatus.REOPENED
  ) {
    return preSubmissionRedirect(request, h, context)
  }

  try {
    const response = await getApplicationStatus(grantCode, context.referenceNumber)
    const { status: gasStatus } = await response.json()

    const newStatus = getNewStatus(gasStatus, previousStatus)
    await persistStatus(request, newStatus, previousStatus, grantId)

    if (shouldContinueDefault(gasStatus, newStatus, previousStatus)) {
      return h.continue
    }

    const rules = grantRedirectRules?.postSubmission ?? []
    const redirectUrl = mapStatusToUrl(gasStatus, newStatus, grantId, rules)
    return request.path === redirectUrl ? h.continue : h.redirect(redirectUrl).takeover()
  } catch (err) {
    if (err.status === statusCodes.notFound) {
      // no submission yet — allow flow-through
      return h.continue
    }

    // unexpected error — log and fallback
    log(LogCodes.SUBMISSION.SUBMISSION_REDIRECT_FAILURE, {
      grantType: grantCode,
      referenceNumber: context.referenceNumber,
      error: err.message
    })

    const fallbackUrl = mapStatusToUrl('default', 'default', grantId, [])

    if (request.path === fallbackUrl) {
      return h.continue
    }
    return h.redirect(fallbackUrl).takeover()
  }
}
