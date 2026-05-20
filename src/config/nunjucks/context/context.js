import { readFileSync } from 'node:fs'
import path from 'node:path'

import { config } from '~/src/config/config.js'
import { buildNavigation } from '~/src/config/nunjucks/context/build-navigation.js'
import { buildCookieBannerConfig } from '~/src/config/nunjucks/context/build-cookie-banner-config.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const assetPath = config.get('assetPath')
const manifestPath = path.join(config.get('root'), '.public/assets-manifest.json')

/** @type {Record<string, string> | undefined} */
let webpackManifest

/**
 * @param {ExtendedRequest | undefined} request
 * @param {string | null | undefined} role
 * @returns {AuthDetails} User authentication and authorization details
 */
const usersDetails = (request, role) => {
  return {
    isAuthenticated: request?.auth?.isAuthenticated ?? false,
    sbi: request?.auth?.credentials?.sbi,
    crn: request?.auth?.credentials?.crn,
    name: request?.auth?.credentials?.name,
    organisationId: request?.auth?.credentials?.organisationId,
    organisationName: request?.auth?.credentials?.organisationName,
    relationshipId: request?.auth?.credentials?.relationshipId,
    role
  }
}

/**
 * @param {ExtendedRequest | undefined} request
 * @returns {CookieConsentConfig} Cookie consent configuration including service name, policy URL, and expiry days
 */
const extractCookieConsentConfig = (request) => {
  const formMetadata = request?.app?.model?.def?.metadata
  const cookieConsentMetadata = formMetadata?.cookieConsent
  return {
    serviceName: cookieConsentMetadata?.serviceName || config.get('serviceName'),
    cookiePolicyUrl: cookieConsentMetadata?.cookiePolicyUrl || config.get('cookieConsent.cookiePolicyUrl'),
    cookieConsentExpiryDays: cookieConsentMetadata?.expiryDays || config.get('cookieConsent.expiryDays')
  }
}

/**
 * @param {ExtendedRequest | undefined} request
 * @returns {void}
 */
const loadWebpackManifest = (request) => {
  if (!webpackManifest) {
    try {
      webpackManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch (error) {
      debug(
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorMessage: `Webpack ${path.basename(manifestPath)} not found: ${/** @type {Error} */ (error).message}`
        },
        request
      )
    }
  }
}

/**
 * @param {ExtendedRequest | undefined} request
 * @returns {Promise<SessionData>} Session data object or empty object if unavailable
 */
const getSessionData = async (request) => {
  if (!request?.auth?.isAuthenticated || !request.auth.credentials?.sessionId) {
    return {}
  }

  try {
    const cache = request.server?.app?.cache
    if (!cache) {
      return {}
    }
    return (await cache.get(/** @type {string} */ (request.auth.credentials.sessionId))) || {}
  } catch (cacheError) {
    const sessionId = String(request.auth.credentials.sessionId || 'unknown')
    debug(
      LogCodes.AUTH.SIGN_IN_FAILURE,
      {
        userId: 'unknown',
        errorMessage: `Cache retrieval failed for session ${sessionId}: ${/** @type {Error} */ (cacheError).message}`,
        step: 'context_cache_retrieval'
      },
      request
    )
    return {}
  }
}

/**
 * @param {string} asset
 * @returns {string} The full asset path including webpack hash if available
 */
const createAssetPathGetter = (asset) => {
  const webpackAssetPath = webpackManifest?.[asset]
  return `${assetPath}/${webpackAssetPath ?? asset}`
}

/**
 * Builds common configuration shared between success and fallback contexts
 * @param {string} serviceName
 * @param {string} cookiePolicyUrl
 * @param {number} cookieConsentExpiryDays
 * @param {ExtendedRequest | undefined} request
 * @returns {Record<string, unknown>} Common configuration object
 */
const buildCommonConfig = (serviceName, cookiePolicyUrl, cookieConsentExpiryDays, request) => {
  const cookieConsentName = config.get('cookieConsent.cookieName')
  const gaTrackingId = config.get('googleAnalytics.trackingId')
  const sessionCookieTtl = config.get('session.cookie.ttl')
  const consentCookieValue = /** @type {any} */ (request)?.state?.[cookieConsentName]

  return {
    assetPath: `${assetPath}/assets/rebrand`,
    serviceName,
    serviceUrl: '/',
    cdpEnvironment: config.get('cdpEnvironment'),
    gaTrackingId,
    cookiePolicyUrl,
    cookieConsentName,
    cookieConsentExpiryDays,
    sessionCookieTtl,
    cookieBannerConfig: buildCookieBannerConfig(
      serviceName,
      cookieConsentName,
      cookieConsentExpiryDays,
      gaTrackingId,
      cookiePolicyUrl,
      /** @type {any} */ (request)?.plugins?.crumb
    ),
    crumb: /** @type {any} */ (request)?.plugins?.crumb,
    currentPath: request?.path ?? '/',
    cookiesPolicy: {
      confirmed: Boolean(consentCookieValue),
      analytics: consentCookieValue === 'true'
    },
    breadcrumbs: []
  }
}

/**
 * @param {AuthDetails} auth
 * @param {ExtendedRequest | undefined} request
 * @param {string} serviceName
 * @param {string} cookiePolicyUrl
 * @param {number} cookieConsentExpiryDays
 * @returns {Record<string, unknown>} Complete context object for successful authentication
 */
const buildSuccessContext = (auth, request, serviceName, cookiePolicyUrl, cookieConsentExpiryDays) => {
  const submitButtonText = request?.app?.model?.def?.metadata?.options?.submitButtonText

  return {
    ...buildCommonConfig(serviceName, cookiePolicyUrl, cookieConsentExpiryDays, request),
    auth,
    navigation: buildNavigation(request),
    getAssetPath: createAssetPathGetter,
    ...(submitButtonText ? { submitButtonText } : {})
  }
}

/**
 * @param {string} serviceName
 * @param {string} cookiePolicyUrl
 * @param {number} cookieConsentExpiryDays
 * @returns {Record<string, unknown>} Complete context object for fallback/unauthenticated state
 */
const buildFallbackContext = (serviceName, cookiePolicyUrl, cookieConsentExpiryDays) => {
  return {
    ...buildCommonConfig(serviceName, cookiePolicyUrl, cookieConsentExpiryDays, undefined),
    auth: {
      isAuthenticated: false,
      sbi: null,
      crn: null,
      name: null,
      organisationId: null,
      organisationName: null,
      relationshipId: null,
      role: null
    },
    navigation: [],
    getAssetPath: (/** @type {string} */ asset) => `${assetPath}/${asset}`
  }
}

/**
 * @param {ExtendedRequest | undefined} request
 * @returns {Promise<Record<string, unknown>>} Complete context object for rendering views
 */
export async function context(request) {
  const { serviceName, cookiePolicyUrl, cookieConsentExpiryDays } = extractCookieConsentConfig(request)

  try {
    loadWebpackManifest(request)
    const session = await getSessionData(request)
    const auth = usersDetails(request, session.role)

    return buildSuccessContext(auth, request, serviceName, cookiePolicyUrl, cookieConsentExpiryDays)
  } catch (error) {
    debug(
      LogCodes.SYSTEM.SERVER_ERROR,
      {
        errorMessage: `Error building context: ${/** @type {Error} */ (error).message}`
      },
      request
    )
    return buildFallbackContext(serviceName, cookiePolicyUrl, cookieConsentExpiryDays)
  }
}

/**
 * @import { Request } from '@hapi/hapi'
 */

/**
 * @typedef {object} FormMetadata
 * @property {{ serviceName?: string, cookiePolicyUrl?: string, expiryDays?: number }} [cookieConsent]
 * @property {{ submitButtonText?: string }} [options]
 */

/**
 * @typedef {Request & { app: { model?: { def?: { metadata?: FormMetadata } }, cspNonce?: string } }} ExtendedRequest
 */

/**
 * @typedef {object} AuthDetails
 * @property {boolean} isAuthenticated
 * @property {unknown} sbi
 * @property {unknown} crn
 * @property {unknown} name
 * @property {unknown} organisationId
 * @property {unknown} organisationName
 * @property {unknown} relationshipId
 * @property {string | null | undefined} role
 */

/**
 * @typedef {object} CookieConsentConfig
 * @property {string} serviceName
 * @property {string} cookiePolicyUrl
 * @property {number} cookieConsentExpiryDays
 */

/**
 * @typedef {object} SessionData
 * @property {string | null} [role]
 */
