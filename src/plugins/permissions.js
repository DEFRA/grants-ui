import { randomUUID } from 'node:crypto'
import { fetchBusinessPermissions } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { can } from '~/src/server/common/helpers/permissions/can.js'
const EXCLUDED_PATHS = ['/health', '/auth']

/**
 * @param {AnyRequest} request
 * @returns {boolean}
 */
function shouldSkip(request) {
  return EXCLUDED_PATHS.some((path) => request.path === path || request.path.startsWith(`${path}/`))
}

function getPermissionsCacheKey(request) {
  const { credentials: { crn, sbi } = {} } = request.auth ?? {}
  return `permissions:${crn}:${sbi}`
}

async function getBusinessPermissions(request) {
  const cacheKey = getPermissionsCacheKey(request)
  const cached = request.yar?.get(cacheKey)

  if (cached && !Array.isArray(cached)) {
    return cached
  }

  const businessPermissions = await fetchBusinessPermissions(request)

  request.yar?.set(cacheKey, businessPermissions)

  return businessPermissions
}

export default {
  plugin: {
    name: 'permissions',

    /**
     * @param {Server} server
     */
    register: async (server) => {
      server.ext(
        'onPostAuth',
        /**
         * @param {AnyRequest} request
         * @param {ResponseToolkit} h
         */
        async (request, h) => {
          if (!request.auth.isAuthenticated) {
            return h.continue
          }

          const isUnauthorisedLandingPage = request.path === '/auth/journey-unauthorised'
          if (shouldSkip(request) && !isUnauthorisedLandingPage) {
            return h.continue
          }

          // This landing page must render even if DAL is unavailable. Reuse only
          // permissions already resolved for the active business before the redirect.
          const businessPermissions = isUnauthorisedLandingPage
            ? request.yar?.get(getPermissionsCacheKey(request))
            : await getBusinessPermissions(/** @type {AnyFormRequest} */ (request))
          if (!businessPermissions || Array.isArray(businessPermissions)) {
            return h.continue
          }
          const { role, permissionGroups } = businessPermissions

          const pipelineRequest = /** @type {PipelineRequest & { auth: { credentials: PermissionCredentials } }} */ (
            /** @type {unknown} */ (request)
          )
          pipelineRequest.auth.credentials.permissions = permissionGroups
          const { sessionId, crn, sbi } = /** @type {{ sessionId?: string, crn?: string, sbi?: string }} */ (
            request.auth.credentials
          )
          if (typeof role === 'string' && role && sessionId && crn && sbi) {
            const previous = /** @type {{ sessionId: string, crn: string, sbi: string, token: string } | undefined} */ (
              request.yar?.get('analyticsBusinessContext')
            )
            const current =
              previous?.sessionId === sessionId && previous?.crn === crn && previous?.sbi === sbi
                ? previous
                : { sessionId, crn, sbi, token: randomUUID() }
            request.yar?.set('analyticsBusinessContext', current)
            const app = /** @type {{ userRoleAnalytics?: { role: string, token: string } }} */ (request.app)
            app.userRoleAnalytics = { role, token: current.token }
          }
          pipelineRequest.can = (action, resource) => {
            return can(
              /** @type {Array<{ id: string, level: PermissionLevel }>} */ (
                pipelineRequest.auth.credentials?.permissions ?? []
              ),
              /** @type {PermissionAction} */ (action),
              /** @type {PermissionResource} */ (resource)
            )
          }

          return h.continue
        }
      )
    }
  }
}

/**
 * @typedef {{ permissions?: Array<{ id: string, level: string, functions?: string[] }> }} PermissionCredentials
 */

/**
 * @import { Server, ResponseToolkit } from '@hapi/hapi'
 * @import { AnyRequest, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { PipelineRequest } from '~/src/server/common/request-pipeline/types.js'
 * @import { PermissionAction, PermissionLevel } from '~/src/server/common/helpers/permissions/permission-rules.js'
 * @import { PermissionResource } from '~/src/server/common/helpers/permissions/can.js'
 */
