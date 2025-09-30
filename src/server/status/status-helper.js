import { updateApplicationStatus } from '../common/helpers/status/update-application-status-helper.js'
import { getApplicationStatus } from '../common/services/grant-application/grant-application.service.js'

const statusToUrlConfig = {
  SUBMITTED: (slug) => `/${slug}/confirmation`,
  AWAITING_AMENDMENTS: (slug) => `/${slug}/summary`,
  CLEARED: (slug) => `/startpage`,
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
export const formsStatusCallback = async (request, h) => {
  const grantCode = request.params?.slug
  if (!grantCode) {
    return h.continue
  }

  const clientRef = request.auth.credentials?.sbi
  let applicationStatus = request.yar.get(`applicationStatus_${clientRef}_${grantCode}`)

  if (!applicationStatus) {
    try {
      const response = await getApplicationStatus(grantCode, clientRef)
      const result = await response.json()
      const gasStatus = result?.status

      applicationStatus = gasToGrantsUiStatus[gasStatus] ?? 'SUBMITTED'

      request.yar.set(`applicationStatus_${clientRef}_${grantCode}`, applicationStatus)

      await updateApplicationStatus(applicationStatus, `${clientRef}:${grantCode}`)
    } catch (err) {
      if (err.status === 404) {
        // no submission yet — allow flow-through
        return h.continue
      }

      // unexpected error — log and fallback
      request.server.logger.error(err)
      const fallbackUrl = statusToUrlConfig.DEFAULT(grantCode)
      if (request.path === fallbackUrl) {
        return h.continue
      }
      return h.redirect(fallbackUrl).takeover()
    }
  }

  const redirectUrl = mapStatusToUrl(applicationStatus, grantCode)
  if (request.path === redirectUrl) {
    return h.continue
  }

  return h.redirect(redirectUrl).takeover()
}
