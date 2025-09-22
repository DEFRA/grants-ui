import { formsAuthCallback } from '../auth/forms-engine-plugin-auth-helpers.js'
import { getApplicationStatus } from '../common/services/grant-application/grant-application.service.js'

const statusToUrlConfig = {
  SUBMITTED: '/confirmation',
  IN_REVIEW: '/in-review',
  ELIGIBLE: '/eligible',
  REJECTED: '/rejection',
  DEFAULT: '/start'
}

function mapStatusToUrl(status) {
  return statusToUrlConfig[status] || statusToUrlConfig.DEFAULT
}

// higher-order callback that wraps the existing one
export const formsStatusCallback = async (request, h, params, definition, metadata) => {
  // run existing auth logic first
  formsAuthCallback(request, params, definition, metadata)

  const clientRef = request.auth.credentials?.sbi
  let applicationStatus = request.yar.get('applicationStatus')
  if (!applicationStatus) {
    try {
      const response = await getApplicationStatus(params.slug, clientRef)
      applicationStatus = response?.status
      request.yar.set('applicationStatus', applicationStatus)
    } catch (err) {
      if (err.response?.status === 404) {
        // ✅ no submission yet — allow flow-through
        return h.continue
      }
      // unexpected error — log and fallback
      request.server.logger.error(err)
      return h.redirect(statusToUrlConfig.DEFAULT).takeover()
    }
  }

  const redirectUrl = mapStatusToUrl(applicationStatus)
  return h.redirect(redirectUrl).takeover()
}
