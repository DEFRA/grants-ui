import { cachedMultipleApplications, rememberMultipleApplications } from './multiple-applications-cache.js'
import { getCacheKey, getReferenceNumber } from '../state/get-cache-key-helper.js'
import { fetchLatestDefinitionFromApi } from '../state/fetch-saved-state-helper.js'
import { ExternalApiError } from '../../utils/errors/ExternalApiError.js'
import { statusCodes } from '../../constants/status-codes.js'

/** A grant entry visit that has not selected an application. @param {AnyRequest} request */
export function isUnscopedGrantRoot(request) {
  return (
    request.method === 'get' &&
    request.route?.path === '/{slug}' &&
    !getReferenceNumber(request) &&
    !Object.hasOwn(request.query ?? {}, 'ref')
  )
}

/**
 * Resolve the latest definition for a routing decision without opening an application.
 * Keep this separate from the state envelope so a definition-only read cannot mask
 * a later state read (in particular for single-application grants).
 * @param {AnyRequest} request
 * @returns {Promise<StateWithDefinitionEnvelope | null>}
 */
export function getRoutingDefinition(request) {
  const app = /** @type {{ routingDefinition?: Promise<StateWithDefinitionEnvelope | null> }} */ (request.app)
  if (!app.routingDefinition) {
    app.routingDefinition = fetchLatestDefinitionFromApi(getCacheKey(request).grantCode)
      .then((definition) => {
        rememberMultipleApplications(getCacheKey(request).grantCode, definition)
        return definition ? { definition, state: null, upgraded: false } : null
      })
      .catch((error) => {
        throw new ExternalApiError({
          message: 'Unable to load the grant definition',
          source: 'getRoutingDefinition',
          reason: 'Definition request failed',
          status: statusCodes.badGateway,
          endpoint: 'Grants UI Backend definitions'
        }).from(error)
      })
  }
  return app.routingDefinition
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { StateWithDefinitionEnvelope } from '../state/fetch-saved-state-helper.js'
 */

/** Use lock-free routing for unknown/multi schemes, falling back to the normal state read on failure.
 * @param {AnyRequest} request @returns {Promise<StateWithDefinitionEnvelope | null>}
 */
export async function tryRoutingDefinition(request) {
  if (cachedMultipleApplications(getCacheKey(request).grantCode) === false) {
    return null
  }
  try {
    return await getRoutingDefinition(request)
  } catch {
    // The normal state/definition endpoint remains the authoritative fallback.
    return null
  }
}
