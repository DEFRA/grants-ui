import { WhitelistServiceFactory } from '~/src/server/auth/services/whitelist.service.js'
import { getAllForms } from '~/src/server/dev-tools/utils/index.js'

export default {
  plugin: {
    name: 'whitelist',
    register: (/** @type {Server} */ server) => {
      server.ext('onPostAuth', (request, h) => whitelistHandler(request, h))
    }
  }
}

/**
 * Hapi `onPostAuth` extension that enforces grant whitelist access.
 *
 * @param {Request} request - The incoming request.
 * @param {ResponseToolkit} h - The Hapi response toolkit.
 * @returns {Promise<symbol | ResponseObject>} The continue signal or a redirect response.
 */
const whitelistHandler = async (request, h) => {
  if (!request.auth.isAuthenticated) {
    return h.continue
  }

  const crn = /** @type {string} */ (request.auth.credentials.crn)
  const sbi = /** @type {string} */ (request.auth.credentials.sbi)

  const allForms = await getAllForms()
  const grantMetadata = allForms.find((form) => form.slug === request.params.slug)?.metadata

  const whitelistService = WhitelistServiceFactory.getService(grantMetadata)
  const validation = whitelistService.validateGrantAccess(crn, sbi)

  whitelistService.logWhitelistValidation({
    crn,
    sbi,
    path: request.path,
    crnPassesValidation: validation.crnPassesValidation,
    sbiPassesValidation: validation.sbiPassesValidation,
    hasCrnValidation: validation.hasCrnValidation,
    hasSbiValidation: validation.hasSbiValidation
  })

  if (!validation.overallAccess) {
    await request.sendAuditEvent({
      action: 'unauthorised',
      status: 'denied',
      details: {
        reason: 'whitelist',
        crnPassesValidation: validation.crnPassesValidation,
        sbiPassesValidation: validation.sbiPassesValidation
      }
    })
    return h.redirect(`/auth/journey-unauthorised`).takeover()
  }
  return h.continue
}

/**
 * @import { Request, ResponseObject, ResponseToolkit, Server } from '@hapi/hapi'
 */
