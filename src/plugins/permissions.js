import { fetchBusinessPermissions } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { can } from '~/src/server/common/helpers/permissions/can.js'
const EXCLUDED_PATHS = ['/health', '/assets', '/public', '/auth']

function shouldSkip(request) {
  return EXCLUDED_PATHS.some((path) => request.path.startsWith(path))
}

export default {
  plugin: {
    name: 'permissions',

    register: async (server) => {
      server.ext('onPostAuth', async (request, h) => {
        if (!request.auth.isAuthenticated || shouldSkip(request)) {
          return h.continue
        }

        const permissionGroups = await fetchBusinessPermissions(request)

        request.auth.credentials.permissions = permissionGroups
        request.can = (action, resource) => {
          return can(permissionGroups, action, resource)
        }

        return h.continue
      })
    }
  }
}
