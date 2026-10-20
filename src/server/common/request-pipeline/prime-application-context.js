import { tryRoutingDefinition, isUnscopedGrantRoot } from '../helpers/definition/routing-definition.js'
import { getStateWithDefinition } from '../helpers/state/state-with-definition-context.js'

/**
 * Prime journey state after authentication so definition and state loaders share one read.
 * Selector controllers load their own definition. Unscoped multi-application roots must
 * make their routing decision before opening an application and acquiring its edit lock.
 * @param {import('@hapi/hapi').Request} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 */
export async function primeApplicationContext(request, h) {
  if (/** @type {{definitionOnly?: boolean}} */ (request.route.settings.app)?.definitionOnly === true) {
    return h.continue
  }
  if (!request.params?.slug || !request.auth?.isAuthenticated || !request.auth?.credentials?.contactId) {
    return h.continue
  }
  try {
    if (isUnscopedGrantRoot(request)) {
      const envelope = await tryRoutingDefinition(request)
      const definition = envelope?.definition
      const allowsMultiple =
        definition?.allowMultipleApplications === true ||
        definition?.definition?.metadata?.allowMultipleApplications === true
      if (allowsMultiple) {
        return h.continue
      }
    }
    await getStateWithDefinition(request)
  } catch {
    // The later state/definition loader reports the memoised failure with full context.
  }
  return h.continue
}
