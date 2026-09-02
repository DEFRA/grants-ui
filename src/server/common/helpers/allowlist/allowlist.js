import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { fetchAllowedGrants } from '~/src/server/auth/services/allowlist.client.js'

export default {
  plugin: {
    name: 'allowlist',
    register: (/** @type {Server} */ server) => {
      server.ext('onPostAuth', (request, h) => allowlistHandler(request, h))
    }
  }
}

/**
 * Hapi `onPostAuth` extension that enforces grant access control via the
 * grants-ui-backend /allowlist/grants endpoint.
 *
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {Promise<symbol | ResponseObject>}
 */
const allowlistHandler = async (request, h) => {
  if (!request.auth.isAuthenticated) {
    return h.continue
  }

  if (!request.params.slug) {
    return h.continue
  }

  const crn = /** @type {string} */ (request.auth.credentials.crn)
  const sbi = /** @type {string} */ (request.auth.credentials.sbi)

  const grantCode = request.params.slug

  const allowedGrants = await fetchAllowedGrants(crn, sbi)
  const hasAccess = allowedGrants.includes(grantCode)

  if (hasAccess) {
    log(LogCodes.AUTH.ALLOWLIST_ACCESS_GRANTED, { userId: crn, sbi, path: request.path, grantCode })
    return h.continue
  }

  log(LogCodes.AUTH.ALLOWLIST_ACCESS_DENIED, { userId: crn, sbi, path: request.path, grantCode })
  // Determine whether this request targets a claim journey page so the
  // audit `entity` can be set correctly. The model isn't loaded at this
  // stage, so use a pragmatic path-name heuristic as a best-effort.
  const path = /** @type {string | undefined} */ (request.params?.path)
  const isClaimPath = path?.includes('claim') || request.path.includes('/claim')

  await request.sendAuditEvent({
    entity: isClaimPath ? 'claim' : 'application',
    action: 'unauthorised',
    status: 'denied',
    details: { reason: 'allowlist', grantCode }
  })
  return h.redirect('/auth/journey-unauthorised').takeover()
}

/**
 * @import { Request, ResponseObject, ResponseToolkit, Server } from '@hapi/hapi'
 */
