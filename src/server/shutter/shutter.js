import { config } from '~/src/config/config.js'
import { shutterContentFor } from '~/src/config/shutter-content.js'
import { agreementGrantCode } from '../common/helpers/agreement/agreement-grant-code.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { logHandledError } from '../common/helpers/logging/handled-error.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { fetchLatestDefinitionFromApi } from '../common/helpers/state/fetch-saved-state-helper.js'
import { sfdUrlForOrganisation } from '../common/helpers/sfd-url.js'

const GRANTS_UI_HOME_PATH = '/'

/**
 * Must run before anything that opens or saves the application, so a shuttered POST stores nothing.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
export async function shutterHandler(request, h) {
  const shutteredGrant = request.auth.isAuthenticated && requestedGrant(request)
  if (!isShuttered(shutteredGrant)) {
    return h.continue
  }

  return h
    .view('grant-shuttered', {
      grantName: await grantName(shutteredGrant, request),
      html: shutterContentFor(shutteredGrant),
      falsUrl: farmAndLandServiceUrl(request)
    })
    .code(statusCodes.serviceUnavailable)
    .takeover()
}

/** @param {Request} request @returns {string | undefined} */
function requestedGrant(request) {
  return request.route.path === `${config.get('agreements.baseUrl')}/{path*}`
    ? agreementGrantCode(request)
    : request.params.slug
}

/** @returns {string[]} */
export function shutteredSlugs() {
  return config
    .get('shutter.enabledSlugs')
    .map((slug) => slug.trim())
    .filter(Boolean)
}

/** @param {unknown} slug @returns {slug is string} */
function isShuttered(slug) {
  return shutteredSlugs().includes(/** @type {string} */ (slug))
}

/**
 * @param {string} grantCode
 * @param {Request} request
 */
async function grantName(grantCode, request) {
  try {
    const definitionDocument = await fetchLatestDefinitionFromApi(grantCode)
    return definitionDocument?.definition?.name
  } catch (error) {
    logHandledError(error, request, {
      fallbackCode: LogCodes.SYSTEM.SHUTTER_GRANT_NAME_UNAVAILABLE,
      fallbackDetails: { grantCode }
    })
    return undefined
  }
}

/** @param {Request} request */
function farmAndLandServiceUrl(request) {
  if (!config.get('externalLinks.sfd.enabled')) {
    return GRANTS_UI_HOME_PATH
  }

  const homeUrl = config.get('externalLinks.sfd.homeUrl')
  const sfdHomeUrl = sfdUrlForOrganisation(homeUrl, request)

  if (!sfdHomeUrl) {
    log(LogCodes.SYSTEM.SFD_HOME_URL_MISSING_ON_SHUTTER, { homeUrl: homeUrl ?? '' }, request)
    return GRANTS_UI_HOME_PATH
  }

  return sfdHomeUrl
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 */
