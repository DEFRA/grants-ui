import { BaseError } from '../utils/errors/BaseError.js'

/**
 * Returns the grant version resolved for the current request: the version the
 * backend resolved for the combined state-with-definition envelope
 * (`request.app.grantVersion`), falling back to the version stamped on the
 * form model's metadata (both derive from the same envelope).
 * Throws an error if neither is available.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request - Hapi request object
 * @returns {string | number} - The grantVersion
 */
export function getGrantVersion(request) {
  const grantVersion =
    /** @type {{ grantVersion?: string | number } | undefined} */ (request?.app)?.grantVersion ??
    /** @type {{ model?: { def?: { metadata?: { version?: string | number } } } } | undefined} */ (request?.app)?.model
      ?.def?.metadata?.version

  if (!grantVersion) {
    throw BaseError.wrap(new Error('Missing grantVersion'))
  }
  return grantVersion
}
