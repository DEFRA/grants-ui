import { readFileSync } from 'node:fs'
import path from 'node:path'

import { config } from '~/src/config/config.js'
import { buildNavigation } from '~/src/config/nunjucks/context/build-navigation.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { sbiStore } from '~/src/server/sbi/state.js'

const logger = createLogger()
const assetPath = config.get('assetPath')
const manifestPath = path.join(config.get('root'), '.public/assets-manifest.json')

/** @type {Record<string, string> | undefined} */
let webpackManifest

/**
 * @param {Request | null} request
 */
export async function context(request) {
  const tempSbi = sbiStore.get('sbi')

  if (!webpackManifest) {
    try {
      webpackManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch (error) {
      logger.error(`Webpack ${path.basename(manifestPath)} not found`)
    }
  }

  const session = request?.auth?.isAuthenticated
    ? await request.server.app.cache.get(request.auth.credentials.sessionId)
    : {}
  const auth = {
    isAuthenticated: request?.auth?.isAuthenticated ?? false,
    sbi: session.sbi || tempSbi, // Use temp SBI if no session SBI
    name: session.name,
    organisationId: session.organisationId,
    role: session.role
  }

  return {
    assetPath: `${assetPath}/assets/rebrand`,
    serviceName: config.get('serviceName'),
    serviceUrl: '/',
    enableSbiSelector: config.get('landGrants.enableSbiSelector'),
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
}

/**
 * @import { Request } from '@hapi/hapi'
 */
