import { readFileSync } from 'node:fs'
import path from 'node:path'

import { config } from '~/src/config/config.js'
import { buildNavigation } from '~/src/config/nunjucks/context/build-navigation.js'
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
 * @param {Request | null} request
 */
export async function context(request) {
  try {
    const tempSbi = sbiStore.get('sbi')

    if (!webpackManifest) {
      try {
        webpackManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      } catch (error) {
        log(
          LogCodes.SYSTEM.SERVER_ERROR,
          {
            error: `Webpack ${path.basename(manifestPath)} not found: ${error.message}`
          },
          request
        )
        // Don't let this break the context, just continue without manifest
      }
    }

    let session = {}
    if (request?.auth?.isAuthenticated && request.auth.credentials?.sessionId) {
      try {
        session = (await request.server.app['cache'].get(request.auth.credentials.sessionId)) || {}
      } catch (cacheError) {
        const sessionId = String(request.auth.credentials.sessionId || 'unknown')
        log(
          LogCodes.AUTH.SIGN_IN_FAILURE,
          {
            userId: 'unknown',
            error: `Cache retrieval failed for session ${sessionId}: ${cacheError.message}`,
            step: 'context_cache_retrieval'
          },
          request
        )
        session = {}
      }
    }
    const auth = usersDetails(request, session.sbi || tempSbi, session.role)

    return {
      assetPath: `${assetPath}/assets/rebrand`,
      serviceName: config.get('serviceName'),
      serviceUrl: '/',
      defraIdEnabled: config.get('defraId.enabled'),
      cdpEnvironment: config.get('cdpEnvironment'),
      gaTrackingId: config.get('googleAnalytics.trackingId'),
      auth,
      breadcrumbs: [],
      navigation: buildNavigation(request),

      /**
       * @param {string} asset
       */
      getAssetPath(asset) {
        const webpackAssetPath = webpackManifest?.[asset]
        return `${assetPath}/${webpackAssetPath ?? asset}`
      }
    }
  } catch (error) {
    log(
      LogCodes.SYSTEM.SERVER_ERROR,
      {
        error: `Error building context: ${error.message}`
      },
      request
    )
    // Return a minimal context to prevent complete failure
    return {
      assetPath: `${assetPath}/assets/rebrand`,
      serviceName: config.get('serviceName'),
      serviceUrl: '/',
      cdpEnvironment: config.get('cdpEnvironment'),
      defraIdEnabled: config.get('defraId.enabled'),
      gaTrackingId: config.get('googleAnalytics.trackingId'),
      auth: {
        isAuthenticated: false,
        sbi: null,
        name: null,
        organisationId: null,
        relationshipId: null,
        role: null
      },
      breadcrumbs: [],
      navigation: [],
      getAssetPath: (asset) => `${assetPath}/${asset}`
    }
  }
}

/**
 * @import { Request } from '@hapi/hapi'
 */
