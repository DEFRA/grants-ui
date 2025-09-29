import { getApplicationStatus } from '../common/services/grant-application/grant-application.service.js'

const statusToUrlConfig = {
  SUBMITTED: (slug) => `/${slug}/confirmation`,
  AWAITING_AMENDMENTS: (slug) => `/${slug}/summary`,
  DEFAULT: (slug) => `/${slug}/confirmation`
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
      applicationStatus = result?.status
      request.yar.set(`applicationStatus_${clientRef}_${grantCode}`, applicationStatus)
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
