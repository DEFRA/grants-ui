import { multiApplicationRedirect } from '../../request-pipeline/redirects/multi-application-redirect.js'

export default {
  plugin: {
    name: 'multi-application',
    register: (server) => {
      server.ext('onPostAuth', (request, h) => multiApplicationHandler(request, h))
    }
  }
}

/**
 * The name `@defra/forms-engine-plugin` registers itself under (see its
 * `plugin.js`). Every route it registers runs inside that plugin's own
 * realm, so `request.route.realm.plugin` identifies "is this one of the
 * plugin's own routes" directly - a plugin-identity check, not a guess at
 * the shape of its route paths (which would break silently if the plugin
 * ever renamed a route param or added a path segment).
 *
 * Checking identity like this, rather than denylisting grants-ui's own
 * custom routes under `/{slug}/...` (e.g. `/applications`,
 * `/application-deleted`, `/clear-application-state`), means a new custom
 * route needs no extra work to stay safe - it is registered in grants-ui's
 * own realm, never the plugin's, so it is automatically excluded.
 */
const FORMS_ENGINE_PLUGIN_NAME = '@defra/forms-engine-plugin'

/**
 * Hapi `onPostAuth` extension that resolves `?ref=` routing for grants that
 * allow multiple applications per SBI (see {@link multiApplicationRedirect}).
 *
 * Must run before the forms-engine-plugin's own handler calls `page.getState`
 * (primed separately by the state-with-definition `onPostAuth` extension in
 * `index.js`, which this one is registered ahead of): that call silently
 * creates a brand-new blank application whenever it finds no existing state,
 * which an invalid/foreign `?ref=` must not be allowed to trigger. This is
 * also why the check can't live in the plugin's own `onRequest` pipeline
 * (`formsRequestPipeline`) instead: that hook only ever runs for the
 * plugin's own routes (so it would need no identity check at all), but by
 * the time it fires, `page.getState` has already run - too late to stop the
 * silent-new-application side effect a bad ref would otherwise trigger.
 *
 * Only runs for the forms-engine-plugin's own journey routes - otherwise a
 * custom route like `/applications` would be redirected back to itself
 * (both share the same `slug` param), looping forever.
 *
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {Promise<symbol | ResponseObject>}
 */
const multiApplicationHandler = async (request, h) => {
  const slug = request.params?.slug
  if (
    !slug ||
    !request.auth?.isAuthenticated ||
    !request.auth?.credentials?.contactId ||
    request.route?.realm?.plugin !== FORMS_ENGINE_PLUGIN_NAME
  ) {
    return h.continue
  }

  return multiApplicationRedirect(request, h)
}

/**
 * @import { Request, ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
