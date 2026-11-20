import { getStateWithDefinition } from '../helpers/state/state-with-definition-context.js'

const GROUPED_NUMBER = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/

/** @param {import('@hapi/hapi').Request} request */
function isNumberInputRequest(request) {
  return (
    request.route.realm.plugin === '@defra/forms-engine-plugin' &&
    request.method === 'post' &&
    Boolean(request.params.path) &&
    Boolean(request.payload) &&
    typeof request.payload === 'object'
  )
}

/**
 * @param {import('@defra/forms-model').ComponentDef[]} components
 * @param {Record<string, unknown>} payload
 */
function normaliseNumberFields(components, payload) {
  for (const field of components) {
    const value = payload[field.name]
    if (field.type === 'NumberField' && typeof value === 'string' && GROUPED_NUMBER.test(value.trim())) {
      payload[field.name] = value.trim().replaceAll(',', '')
    }
  }
}

/**
 * Accept thousands separators only in NumberField answers on the requested page.
 * Runs before the engine builds its form context: its normal numeric validation
 * still applies precision/range rules and converts valid answers to numbers.
 * Malformed grouping is left intact so it produces the usual field error.
 *
 * @param {import('@hapi/hapi').Request} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 */
export async function normaliseNumberInputs(request, h) {
  if (!isNumberInputRequest(request)) {
    return h.continue
  }

  const payload = /** @type {Record<string, unknown>} */ (request.payload)
  if (!Object.values(payload).some((value) => typeof value === 'string' && value.includes(','))) {
    return h.continue
  }

  // The model is loaded in a route prerequisite, after onPreHandler. Use the
  // same request-memoised backend definition that the engine will resolve.
  const envelope = await getStateWithDefinition(request)
  const page = envelope?.definition?.definition?.pages.find(
    (candidatePage) => candidatePage.path === `/${request.params.path}`
  )
  if (!page || !('components' in page)) {
    return h.continue
  }

  normaliseNumberFields(page.components ?? [], payload)

  return h.continue
}
