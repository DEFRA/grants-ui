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

  if (cached) {
    return cached
  }

  const permissionGroups = await fetchBusinessPermissions(request)

  request.yar?.set(cacheKey, permissionGroups)

  return permissionGroups
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
          if (!request.auth.isAuthenticated || shouldSkip(request)) {
            return h.continue
          }

          const permissionGroups = await getBusinessPermissions(/** @type {AnyFormRequest} */ (request))

          const pipelineRequest = /** @type {PipelineRequest & { auth: { credentials: PermissionCredentials } }} */ (
            /** @type {unknown} */ (request)
          )
          pipelineRequest.auth.credentials.permissions = permissionGroups
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
