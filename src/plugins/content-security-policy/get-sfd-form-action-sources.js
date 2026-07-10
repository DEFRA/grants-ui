import { error, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * @param {object} options
 * @param {boolean} options.isSfdEnabled
 * @param {string | undefined | null} options.sfdUpdateUrl
 * @param {string | null} options.identityProviderOrigin
 * @returns {string[]}
 */
function getSfdFormActionSources({ isSfdEnabled, sfdUpdateUrl, identityProviderOrigin }) {
  if (!isSfdEnabled) {
    return []
  }

  const updateUrl = sfdUpdateUrl?.trim()
  if (!updateUrl) {
    return []
  }

  if (!URL.canParse(updateUrl)) {
    error(LogCodes.SYSTEM.CSP_SFD_UPDATE_URL_INVALID, { sfdUpdateUrl: updateUrl })
    return []
  }

  const sfdOrigin = new URL(updateUrl).origin
  if (!identityProviderOrigin) {
    error(LogCodes.SYSTEM.CSP_IDENTITY_PROVIDER_ORIGIN_INVALID, { identityProviderOrigin })
    return [sfdOrigin]
  }

  return [sfdOrigin, identityProviderOrigin]
}

export { getSfdFormActionSources }
