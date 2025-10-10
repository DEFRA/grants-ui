import { ApplicationStatus } from '../common/constants/application-status.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { updateApplicationStatus } from '../common/helpers/status/update-application-status-helper.js'
import { getApplicationStatus } from '../common/services/grant-application/grant-application.service.js'

const statusToUrlConfig = {
  SUBMITTED: (slug) => `/${slug}/confirmation`,
  REOPENED: (slug) => `/${slug}/summary`,
  CLEARED: (slug) => `/${slug}/start`,
  AWAITING_AMENDMENTS: (slug) => `/${slug}/summary`,
  DEFAULT: (slug) => `/${slug}/confirmation`
}

const gasToGrantsUiStatus = {
  RECEIVED: 'SUBMITTED',
  AWAITING_AMENDMENTS: 'REOPENED', // first visit post-submission → re-opened
  APPLICATION_WITHDRAWN: 'CLEARED',
  OFFER_SENT: 'SUBMITTED',
  OFFER_WITHDRAWN: 'SUBMITTED',
  OFFER_ACCEPTED: 'SUBMITTED'
}

function mapStatusToUrl(status, slug) {
  const fn = statusToUrlConfig[status] ?? statusToUrlConfig.DEFAULT
  return fn(slug)
}

// higher-order callback that wraps the existing one
export const formsStatusCallback = async (request, h, context) => {
  const grantId = request.params?.slug
  if (!grantId) {
    return h.continue
  }

  const organisationId = request.auth.credentials?.sbi
  const previousStatus = context.state.applicationStatus

  try {
    const response = await getApplicationStatus(grantId, context.referenceNumber)
    const result = await response.json()
    const gasStatus = result?.status

    // Determine new GrantsUI status based on GAS + previous context state
    let newStatus
    if (gasStatus === 'AWAITING_AMENDMENTS' && previousStatus === 'SUBMITTED') {
      newStatus = 'REOPENED'
    } else {
      newStatus = gasToGrantsUiStatus[gasStatus] ?? 'SUBMITTED'
    }

    if (newStatus !== previousStatus) {
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

    // Let the DXT plugin handle its default behaviour
    if (
      (gasStatus === 'AWAITING_AMENDMENTS' && newStatus === 'REOPENED' && previousStatus !== 'SUBMITTED') ||
      (gasStatus === 'APPLICATION_WITHDRAWN' &&
        newStatus === 'CLEARED' &&
        !['SUBMITTED', 'REOPENED'].includes(previousStatus))
    ) {
      return h.continue
    }

    // Redirect if path doesn't match expected URL for the new status
    const redirectUrl = mapStatusToUrl(newStatus, grantId)
    if (request.path === redirectUrl) {
      return h.continue
    }

    return h.redirect(redirectUrl).takeover()
  } catch (err) {
    if (err.status === 404) {
      // no submission yet — allow flow-through
      return h.continue
    }

    // unexpected error — log and fallback
    request.server.logger.error(err)
    const fallbackUrl = statusToUrlConfig.DEFAULT(grantId)
    if (request.path === fallbackUrl) {
      return h.continue
    }
    return h.redirect(fallbackUrl).takeover()
  }
}
