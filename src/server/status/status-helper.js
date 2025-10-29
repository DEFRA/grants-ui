import { ApplicationStatus } from '../common/constants/application-status.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { updateApplicationStatus } from '../common/helpers/status/update-application-status-helper.js'
import { getApplicationStatus } from '../common/services/grant-application/grant-application.service.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import agreements from '../../config/agreements.js'
import { shouldRedirectToAgreements } from '../common/helpers/agreements-redirect-helper.js'

const statusToUrlConfig = {
  // GrantsUI -> GAS combined mapping
  submitted: {
    received: (slug) => `/${slug}/confirmation`,
    offerSent: (slug) => `/${slug}/confirmation`,
    offerWithdrawn: (slug) => `/${slug}/confirmation`,
    offerAccepted: (slug) => `/${slug}/confirmation`,
    default: (slug) => `/${slug}/confirmation`
  },
  reopened: {
    default: (slug) => `/${slug}/summary`
  },
  cleared: {
    default: (slug) => `/${slug}/start`
  },
  awaitingAmendments: {
    default: (slug) => `/${slug}/summary`
  },
  default: {
    default: (slug) => `/${slug}/confirmation`
  }
}

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
function mapStatusToUrl(gasStatus, grantsUiStatus, slug) {
  if (shouldRedirectToAgreements(slug, gasStatus)) {
    return agreements.get('baseUrl')
  }

  const grantsUiConfig = statusToUrlConfig[grantsUiStatus.toLowerCase()] ?? statusToUrlConfig.default
  const fn = grantsUiConfig[gasStatus.toLowerCase()] ?? grantsUiConfig.default ?? statusToUrlConfig.default.default
  return fn(slug)
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
    const { crn } = request.auth.credentials
    await cacheService.setState(request, {
      applicationStatus: ApplicationStatus.CLEARED,
      submittedAt: new Date().toISOString(),
      submittedBy: crn
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

// higher-order callback that wraps the existing one
export const formsStatusCallback = async (request, h, context) => {
  const grantId = request.params?.slug
  // grantCode should always be available in the config
  const grantCode = request.app.model?.def?.metadata?.submission.grantCode

  if (!grantId) {
    return h.continue
  }

  const previousStatus = context.state?.applicationStatus

  if (!previousStatus || previousStatus !== 'SUBMITTED') {
    return h.continue
  }

  try {
    const response = await getApplicationStatus(grantCode, context.referenceNumber)
    const { status: gasStatus } = await response.json()

    const newStatus = getNewStatus(gasStatus, previousStatus)
    await persistStatus(request, newStatus, previousStatus, grantId)

    if (shouldContinueDefault(gasStatus, newStatus, previousStatus)) {
      return h.continue
    }

    const redirectUrl = mapStatusToUrl(gasStatus, newStatus, grantId)
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

    const fallbackUrl = statusToUrlConfig.default.default(grantId)
    if (request.path === fallbackUrl) {
      return h.continue
    }
    return h.redirect(fallbackUrl).takeover()
  }
}
