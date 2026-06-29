import { fetchBusinessPermissions } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { can } from '~/src/server/common/helpers/permissions/can.js'
const EXCLUDED_PATHS = ['/health', '/auth']

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

    register: async (server) => {
      server.ext('onPostAuth', async (request, h) => {
        if (!request.auth.isAuthenticated || shouldSkip(request)) {
          return h.continue
        }

        const permissionGroups = await getBusinessPermissions(request)

        request.auth.credentials.permissions = permissionGroups
        request.can = (action, resource) => {
          return can(request.auth.credentials?.permissions ?? [], action, resource)
        }

        return h.continue
      })
    }
  }
}
