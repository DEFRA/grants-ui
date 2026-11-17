import { readFileSync } from 'node:fs'
import path from 'node:path'

import { config } from '~/src/config/config.js'
import { buildNavigation } from '~/src/config/nunjucks/context/build-navigation.js'
import { buildCookieBannerConfig } from '~/src/config/nunjucks/context/build-cookie-banner-config.js'
import { buildNotificationBannerConfig } from '~/src/config/nunjucks/context/build-notification-banner-config.js'
import { buildServiceBranding } from '~/src/config/nunjucks/context/build-service-branding.js'
import { pageSubmitButtonText } from '~/src/config/nunjucks/page-config.js'
import { buildFeedbackSurveyUrl } from '~/src/server/common/helpers/feedback-survey.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const assetPath = config.get('assetPath')
const manifestPath = path.join(config.get('root'), '.public/assets-manifest.json')

/** @type {Record<string, string> | undefined} */
let webpackManifest

/**
 * @param {ExtendedRequest | undefined} request
 * @returns {AuthDetails} User authentication and authorization details
 */
const usersDetails = (request) => {
  return {
    isAuthenticated: request?.auth?.isAuthenticated ?? false,
    sbi: request?.auth?.credentials?.sbi,
    crn: request?.auth?.credentials?.crn,
    name: request?.auth?.credentials?.name,
    organisationName: request?.auth?.credentials?.organisationName,
    relationshipId: request?.auth?.credentials?.relationshipId
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
  // Watch builds change asset filenames without restarting the server.
  if (!config.get('isProduction') || !webpackManifest) {
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

  // Append returnUrl to the cookie policy URL so the footer link returns the user
  // to the page they were on when they clicked the Cookies link
  const requestPath = /** @type {any} */ (request)?.url
  const returnUrl = requestPath ? requestPath.pathname + requestPath.search + requestPath.hash : null
  let cookiePolicyUrlWithReturn = cookiePolicyUrl
  if (returnUrl && !cookiePolicyUrl.includes('returnUrl')) {
    const separator = cookiePolicyUrl.includes('?') ? '&' : '?'
    cookiePolicyUrlWithReturn = `${cookiePolicyUrl}${separator}returnUrl=${encodeURIComponent(returnUrl)}`
  }

  return {
    assetPath: `${assetPath}/assets/rebrand`,
    defraAssetPath: `${assetPath}/assets/defra`,
    serviceName,
    serviceUrl: '/',
    cdpEnvironment: config.get('cdpEnvironment'),
    gaTrackingId,
    cookiePolicyUrl: cookiePolicyUrlWithReturn,
    cookieConsentName,
    cookieConsentExpiryDays,
    sessionCookieTtl,
    cookieBannerConfig: buildCookieBannerConfig(
      serviceName,
      cookieConsentName,
      cookieConsentExpiryDays,
      gaTrackingId,
      cookiePolicyUrlWithReturn,
      /** @type {any} */ (request)?.plugins?.crumb
    ),
    crumb: /** @type {any} */ (request)?.plugins?.crumb,
    currentPath: request?.path ?? '/',
    notificationBanner: buildNotificationBannerConfig(
      request?.app?.model?.def?.metadata?.notificationBanner,
      request?.path
    ),
    cookiesPolicy: {
      confirmed: Boolean(consentCookieValue),
      analytics: consentCookieValue === 'true'
    },
    breadcrumbs: [],
    feedbackSurveyUrl: buildFeedbackSurveyUrl(/** @type {any} */ (request)),
    componentMapsEnabled: Boolean(config.get('maps.forms.apiSecret'))
  }
}

/**
 * @param {AuthDetails} auth
 * @param {ExtendedRequest | undefined} request
 * @param {string} serviceName
 * @param {string} cookiePolicyUrl
 * @param {number} cookieConsentExpiryDays
 * @param {FormMetadata | undefined} metadata
 * @returns {Record<string, unknown>} Complete context object for successful authentication
 */
const buildSuccessContext = (auth, request, serviceName, cookiePolicyUrl, cookieConsentExpiryDays, metadata) => {
  // A page-level `config.submitButtonText` overrides the grant-level
  // `options.submitButtonText`; fall back to the grant-level value otherwise.
  const submitButtonText =
    pageSubmitButtonText(request) ?? request?.app?.model?.def?.metadata?.options?.submitButtonText

  return {
    ...buildCommonConfig(serviceName, cookiePolicyUrl, cookieConsentExpiryDays, request),
    auth,
    navigation: buildNavigation(request, metadata),
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
      organisationName: null,
      relationshipId: null
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
  let formMetadata = request?.app?.model?.def?.metadata
  let serviceBranding = buildServiceBranding(request)

  try {
    // Standalone grant pages have no forms-engine model. Reuse their already
    // loaded definition without opening an application or fetching another copy.
    if (!request?.app?.model?.def) {
      const definitionPromise = request?.app?.stateWithDefinition ?? request?.app?.routingDefinition
      // Definition failures are handled by the original loader/global handler;
      // rendering its error page must not log the same failure again.
      const envelope = await definitionPromise?.catch(() => undefined)
      formMetadata = envelope?.definition?.definition?.metadata
      serviceBranding = buildServiceBranding(request, formMetadata)
    }

    loadWebpackManifest(request)
    const auth = usersDetails(request)

    return {
      ...buildSuccessContext(auth, request, serviceName, cookiePolicyUrl, cookieConsentExpiryDays, formMetadata),
      ...serviceBranding
    }
  } catch (error) {
    debug(
      LogCodes.SYSTEM.SERVER_ERROR,
      {
        errorMessage: `Error building context: ${/** @type {Error} */ (error).message}`
      },
      request
    )
    return {
      ...buildFallbackContext(serviceName, cookiePolicyUrl, cookieConsentExpiryDays),
      ...serviceBranding
    }
  }
}

/**
 * @import { Request } from '@hapi/hapi'
 */

/**
 * @typedef {object} FormMetadata
 * @property {{ serviceName?: string, cookiePolicyUrl?: string, expiryDays?: number }} [cookieConsent]
 * @property {{ submitButtonText?: string }} [options]
 * @property {Record<string, Record<string, unknown>>} [pageConfig]
 * @property {import('~/src/config/nunjucks/context/build-notification-banner-config.js').NotificationBannerMetadata} [notificationBanner]
 * @property {string} [phase]
 * @property {boolean} [allowMultipleApplications]
 */

/**
 * @typedef {object} DefinitionEnvelope
 * @property {{definition?: {metadata?: FormMetadata}}} [definition]
 */

/**
 * @typedef {Request & { app: { model?: { def?: { metadata?: FormMetadata } }, stateWithDefinition?: Promise<DefinitionEnvelope | null>, routingDefinition?: Promise<DefinitionEnvelope | null>, cspNonce?: string } }} ExtendedRequest
 */

/**
 * @typedef {object} AuthDetails
 * @property {boolean} isAuthenticated
 * @property {unknown} sbi
 * @property {unknown} crn
 * @property {unknown} name
 * @property {unknown} organisationName
 * @property {unknown} relationshipId
 */

/**
 * @typedef {object} CookieConsentConfig
 * @property {string} serviceName
 * @property {string} cookiePolicyUrl
 * @property {number} cookieConsentExpiryDays
 */
