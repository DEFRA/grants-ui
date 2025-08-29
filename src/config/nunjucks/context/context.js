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
 * @param {Request | null} request
 */
export async function context(request) {
  try {
    const tempSbi = sbiStore.get('sbi')
    const { sbi } = request.auth.credentials

    if (!webpackManifest) {
      try {
        webpackManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      } catch (error) {
        log(LogCodes.SYSTEM.SERVER_ERROR, {
          error: `Webpack ${path.basename(manifestPath)} not found: ${error.message}`
        })
        // Don't let this break the context, just continue without manifest
      }
    }

    let session = {}
    if (request?.auth?.isAuthenticated && request.auth.credentials?.sessionId) {
      try {
        session = (await request.server.app.cache.get(request.auth.credentials.sessionId)) || {}
      } catch (cacheError) {
        const sessionId = String(request.auth.credentials.sessionId || 'unknown')
        log(LogCodes.AUTH.SIGN_IN_FAILURE, {
          userId: 'unknown',
          error: `Cache retrieval failed for session ${sessionId}: ${cacheError.message}`,
          step: 'context_cache_retrieval'
        })
        session = {}
      }
    }
    const auth = {
      isAuthenticated: request?.auth?.isAuthenticated ?? false,
      sbi: sbi || tempSbi, // Use temp SBI if no session SBI
      name: session.name,
      organisationId: session.organisationId,
      role: session.role
    }

    return {
      assetPath: `${assetPath}/assets/rebrand`,
      serviceName: config.get('serviceName'),
      serviceUrl: '/',
      defraIdEnabled: config.get('defraId.enabled'),
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
    log(LogCodes.SYSTEM.SERVER_ERROR, {
      error: `Error building context: ${error.message}`
    })
    // Return a minimal context to prevent complete failure
    return {
      assetPath: `${assetPath}/assets/rebrand`,
      serviceName: config.get('serviceName'),
      serviceUrl: '/',
      defraIdEnabled: config.get('defraId.enabled'),
      auth: {
        isAuthenticated: false,
        sbi: null,
        name: null,
        organisationId: null,
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
