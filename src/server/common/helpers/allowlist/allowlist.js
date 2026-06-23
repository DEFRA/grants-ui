import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { fetchAllowedGrants } from '~/src/server/auth/services/allowlist.client.js'
import { getAllForms } from '~/src/server/dev-tools/utils/index.js'

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

  const allForms = await getAllForms()
  const form = allForms.find((f) => f.slug === request.params.slug)

  if (!form) {
    return h.continue
  }

  const metadata = /** @type {{ submission?: { grantCode?: string } } | undefined} */ (form?.metadata)
  const grantCode = metadata?.submission?.grantCode ?? form?.slug

  const allowedGrants = await fetchAllowedGrants(crn, sbi)
  const hasAccess = allowedGrants.includes(grantCode)

  if (hasAccess) {
    log(LogCodes.AUTH.ALLOWLIST_ACCESS_GRANTED, { userId: crn, sbi, path: request.path, grantCode })
    return h.continue
  }

  log(LogCodes.AUTH.ALLOWLIST_ACCESS_DENIED, { userId: crn, sbi, path: request.path, grantCode })
  await request.sendAuditEvent({
    action: 'unauthorised',
    status: 'denied',
    details: { reason: 'whitelist', grantCode }
  })
  return h.redirect('/auth/journey-unauthorised').takeover()
}

/**
 * @import { Request, ResponseObject, ResponseToolkit, Server } from '@hapi/hapi'
 */
