/**
 * @param {PipelineRequest} request
 * @returns {PermissionConfig | undefined}
 */
export function getPermissionConfig(request) {
  return /** @type {PermissionConfig | undefined} */ (request.app.model?.def?.metadata?.permissions)
}

/**
 * @param {PipelineRequest} request
 * @returns {string | undefined}
 */
export function getRequiredPermission(request) {
  const permissionConfig = getPermissionConfig(request)

  const matchedRule = permissionConfig?.pageAccess?.rules?.find((/** @type {PageAccessRule} */ rule) =>
    rule.paths.includes(request.params.path)
  )

  return matchedRule?.permission ?? permissionConfig?.pageAccess?.default
}

/**
 * @param {PipelineRequest} request
 * @returns {string}
 */
export function getPermissionResource(request) {
  const permissionConfig = getPermissionConfig(request)

  if (!permissionConfig) {
    throw new Error('Permission config missing')
  }

  if (!permissionConfig.resource) {
    throw new Error(`Permission enforcement enabled but no resource configured for grant ${request.params.slug}`)
  }

  return permissionConfig.resource
}

/**
 * @typedef {object} PageAccessRule
 * @property {string[]} paths
 * @property {string} permission
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
