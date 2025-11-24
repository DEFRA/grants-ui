import { readFileSync } from 'node:fs'
import path from 'node:path'

import { config } from '~/src/config/config.js'
import { buildNavigation } from '~/src/config/nunjucks/context/build-navigation.js'
import {
  buildCookieBannerConfig,
  buildCookieBannerNoscriptConfig
} from '~/src/config/nunjucks/context/build-cookie-banner-config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { sbiStore } from '~/src/server/sbi/state.js'

const assetPath = config.get('assetPath')
const manifestPath = path.join(config.get('root'), '.public/assets-manifest.json')

/** @type {Record<string, string> | undefined} */
let webpackManifest

/**
 * @param {Request | null } request
 * @param {string|null} tempSbi
 * @param {string|null} role
 * @returns {object} User authentication and authorization details
 */
const usersDetails = (request, tempSbi, role) => {
  return {
    isAuthenticated: request?.auth?.isAuthenticated ?? false,
    sbi: request?.auth?.credentials?.sbi || tempSbi, // Use temp SBI if no session SBI
    crn: request?.auth?.credentials?.crn,
    name: request?.auth?.credentials?.name,
    organisationId: request?.auth?.credentials?.organisationId,
    organisationName: request?.auth?.credentials?.organisationName,
    relationshipId: request?.auth?.credentials?.relationshipId,
    role
  }
}
/**
 * @typedef {import('@hapi/hapi').Request & { app: { model?: { def?: { metadata?: any } }, cspNonce?: string } }} ExtendedRequest
 */

/**
 * @param {ExtendedRequest | null} request
 * @returns {object} Cookie consent configuration including service name, policy URL, and expiry days
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

const loadWebpackManifest = (request) => {
  if (!webpackManifest) {
    try {
      webpackManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch (error) {
      log(
        LogCodes.SYSTEM.SERVER_ERROR,
        {
          errorMessage: `Webpack ${path.basename(manifestPath)} not found: ${error.message}`
        },
        request
      )
    }
  }
}

/**
 * @param {ExtendedRequest | null} request
 * @returns {Promise<object>} Session data object or empty object if unavailable
 */
const getSessionData = async (request) => {
  if (!request?.auth?.isAuthenticated || !request.auth.credentials?.sessionId) {
    return {}
  }

  try {
    // @ts-ignore - cache is a custom property added to server.app
    const cache = request.server?.app?.cache
    if (!cache) {
      return {}
    }
    return (await cache.get(request.auth.credentials.sessionId)) || {}
  } catch (cacheError) {
    const sessionId = String(request.auth.credentials.sessionId || 'unknown')
    log(
      LogCodes.AUTH.SIGN_IN_FAILURE,
      {
        userId: 'unknown',
        errorMessage: `Cache retrieval failed for session ${sessionId}: ${cacheError.message}`,
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
 * @returns {object} Common configuration object
 */
const buildCommonConfig = (serviceName, cookiePolicyUrl, cookieConsentExpiryDays) => {
  const cookieConsentName = config.get('cookieConsent.cookieName')
  const gaTrackingId = config.get('googleAnalytics.trackingId')

  return {
    assetPath: `${assetPath}/assets/rebrand`,
    serviceName,
    serviceUrl: '/',
    defraIdEnabled: config.get('defraId.enabled'),
    cdpEnvironment: config.get('cdpEnvironment'),
    gaTrackingId,
    cookiePolicyUrl,
    cookieConsentName,
    cookieConsentExpiryDays,
    cookieBannerConfig: buildCookieBannerConfig(
      serviceName,
      cookieConsentName,
      cookieConsentExpiryDays,
      gaTrackingId,
      cookiePolicyUrl
    ),
    cookieBannerNoscriptConfig: buildCookieBannerNoscriptConfig(serviceName),
    breadcrumbs: []
  }
}

/**
 * @param {any} auth
 * @param {ExtendedRequest | null} request
 * @param {string} serviceName
 * @param {string} cookiePolicyUrl
 * @param {number} cookieConsentExpiryDays
 * @returns {object} Complete context object for successful authentication
 */
const buildSuccessContext = (auth, request, serviceName, cookiePolicyUrl, cookieConsentExpiryDays) => {
  return {
    ...buildCommonConfig(serviceName, cookiePolicyUrl, cookieConsentExpiryDays),
    auth,
    navigation: buildNavigation(request),
    getAssetPath: createAssetPathGetter
  }
}

/**
 * @param {string} serviceName
 * @param {string} cookiePolicyUrl
 * @param {number} cookieConsentExpiryDays
 * @returns {object} Complete context object for fallback/unauthenticated state
 */
const buildFallbackContext = (serviceName, cookiePolicyUrl, cookieConsentExpiryDays) => {
  return {
    ...buildCommonConfig(serviceName, cookiePolicyUrl, cookieConsentExpiryDays),
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
    getAssetPath: (asset) => `${assetPath}/${asset}`
  }
}

/**
 * @param {ExtendedRequest | null} request
 * @returns {Promise<object>} Complete context object for rendering views
 */
export async function context(request) {
  const { serviceName, cookiePolicyUrl, cookieConsentExpiryDays } = extractCookieConsentConfig(request)

  try {
    const tempSbi = sbiStore.get('sbi')
    loadWebpackManifest(request)
    const session = await getSessionData(request)
    const auth = usersDetails(request, session.sbi || tempSbi, session.role)

    return buildSuccessContext(auth, request, serviceName, cookiePolicyUrl, cookieConsentExpiryDays)
  } catch (error) {
    log(
      LogCodes.SYSTEM.SERVER_ERROR,
      {
        errorMessage: `Error building context: ${error.message}`
      },
      request
    )
    return buildFallbackContext(serviceName, cookiePolicyUrl, cookieConsentExpiryDays)
  }
}

/**
 * @import { Request } from '@hapi/hapi'
 */
