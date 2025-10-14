import { ApplicationStatus } from '../common/constants/application-status.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { updateApplicationStatus } from '../common/helpers/status/update-application-status-helper.js'
import { getApplicationStatus } from '../common/services/grant-application/grant-application.service.js'

const statusToUrlConfig = {
  // GrantsUI → GAS combined mapping
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

function mapStatusToUrl(gasStatus, grantsUiStatus, slug) {
  const grantsUiConfig = statusToUrlConfig[grantsUiStatus.toLowerCase()] ?? statusToUrlConfig.default
  const fn = grantsUiConfig[gasStatus.toLowerCase()] ?? grantsUiConfig.default ?? statusToUrlConfig.default.default
  return fn(slug)
}

function getNewStatus(gasStatus, previousStatus) {
  if (gasStatus === 'AWAITING_AMENDMENTS' && previousStatus === 'SUBMITTED') {
    return 'REOPENED'
  }
  return gasToGrantsUiStatus[gasStatus] ?? 'SUBMITTED'
}

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

  if (!grantId) {
    return h.continue
  }

  const previousStatus = context.state.applicationStatus

  if (previousStatus !== 'SUBMITTED') {
    return h.continue
  }

  try {
    const response = await getApplicationStatus(grantId, context.referenceNumber)
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
    request.server.logger.error(err)
    const fallbackUrl = statusToUrlConfig.default.default(grantId)
    if (request.path === fallbackUrl) {
      return h.continue
    }
    return h.redirect(fallbackUrl).takeover()
  }
}
