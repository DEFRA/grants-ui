/**
 * @param {PipelineRequest} request
 * @returns {PermissionConfig | undefined}
 */
export function getPermissionConfig(request) {
  return /** @type {PermissionConfig | undefined} */ (request.app.model?.def?.metadata?.permissions)
}

/**
 * Finds the page access rule whose `paths` include the current request path.
 *
 * A single form definition can mix journeys (e.g. the application journey and
 * the claims journey) whose pages are governed by different resources, so the
 * matched rule is the anchor for resolving both the required permission and the
 * resource for the current page.
 *
 * @param {PipelineRequest} request
 * @returns {PageAccessRule | undefined}
 */
function getMatchedRule(request) {
  const permissionConfig = getPermissionConfig(request)

  return permissionConfig?.pageAccess?.rules?.find((/** @type {PageAccessRule} */ rule) =>
    rule.paths.includes(request.params.path)
  )
}

/**
 * @param {PipelineRequest} request
 * @returns {string | undefined}
 */
export function getRequiredPermission(request) {
  const permissionConfig = getPermissionConfig(request)

  return getMatchedRule(request)?.permission ?? permissionConfig?.pageAccess?.default
}

/**
 * Resolves the resource enforced for the current page.
 *
 * The resource is taken from the matched page access rule when present (so
 * claims journey pages can enforce `csAgreements` while the rest of the grant
 * enforces `csApplications`), otherwise it falls back to the top-level
 * `resource`, which acts as the grant-wide default.
 *
 * @param {PipelineRequest} request
 * @returns {string}
 */
export function getPermissionResource(request) {
  const permissionConfig = getPermissionConfig(request)

  if (!permissionConfig) {
    throw new Error('Permission config missing')
  }

  const resource = getMatchedRule(request)?.resource ?? permissionConfig.resource

  if (!resource) {
    throw new Error(`Permission enforcement enabled but no resource configured for grant ${request.params.slug}`)
  }

  return resource
}

/**
 * @typedef {object} PageAccessRule
 * @property {string[]} paths
 * @property {string} [permission] Required permission for the matched paths;
 *   falls back to `pageAccess.default` when omitted.
 * @property {string} [resource] Resource enforced for the matched paths (e.g.
 *   `csAgreements` for claims journey pages); falls back to the top-level
 *   `resource` when omitted.
 */

/**
 * @typedef {object} PageAccess
 * @property {PageAccessRule[]} [rules]
 * @property {string} [default]
 */

/**
 * @typedef {object} PermissionConfig
 * @property {PageAccess} [pageAccess]
 * @property {string} [resource]
 */

/**
 * @import { PipelineRequest } from '~/src/server/common/request-pipeline/types.js'
 */
