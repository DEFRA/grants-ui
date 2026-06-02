import { permissionRules } from './permission-rules.js'

/**
 * @typedef {keyof typeof permissionRules} PermissionResource
 */

/**
 * Determines whether a permission set allows an action on a resource.
 *
 * @param {Array<{
 *   id: string,
 *   level: import('./permission-rules.js').PermissionLevel
 * }>} userPermissions
 * @param {import('./permission-rules.js').PermissionAction} requiredPermission
 * @param {PermissionResource} resource
 * @returns {boolean}
 */
export const can = (userPermissions, requiredPermission, resource) => {
  const rule = permissionRules[resource]
  if (!rule) {
    return false
  }

  const allowedLevels = rule.permissions[requiredPermission]

  if (!allowedLevels) {
    return false
  }

  const permission = userPermissions.find((group) => group.id === rule.permissionGroup)

  if (!permission) {
    return false
  }

  return allowedLevels.includes(permission.level)
}
