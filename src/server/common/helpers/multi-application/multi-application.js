import { multiApplicationRedirect } from '../../request-pipeline/redirects/multi-application-redirect.js'

const FORMS_ENGINE_PLUGIN_NAME = '@defra/forms-engine-plugin'

export default {
  plugin: {
    name: 'multi-application',
    register: (server) => {
      server.ext('onPostAuth', (request, h) => multiApplicationHandler(request, h))
    }
  }
}

/**
 * Hapi `onPostAuth` extension that resolves `?ref=` routing for an SBI that
 * holds more than one application for a grant (see {@link multiApplicationRedirect}).
 *
 * Must run before `page.getState` (called by the plugin's own route handler),
 * which silently creates a blank application on no existing state - an
 * invalid/foreign `?ref=` must be rejected before that happens.
 *
 * Only runs for the plugin's own journey routes - otherwise a custom route
 * like `/applications` would redirect back to itself and loop forever.
 *
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {Promise<symbol | ResponseObject>}
 */
const multiApplicationHandler = async (request, h) => {
  const isNotFormsEnginePlugin = (r) => r.route?.realm?.plugin !== FORMS_ENGINE_PLUGIN_NAME

  const slug = request.params?.slug
  if (
    !slug ||
    !request.auth?.isAuthenticated ||
    !request.auth?.credentials?.contactId ||
    isNotFormsEnginePlugin(request)
  ) {
    return h.continue
  }

  return multiApplicationRedirect(request, h)
}

/**
 * @import { Request, ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
