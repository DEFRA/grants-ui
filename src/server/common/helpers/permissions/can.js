import { permissionLevels } from './permission-levels.js'
import { permissionRules } from './permission-rules.js'

/**
 * Determines whether a permission set allows an action on a resource.
 *
 * @param {Array<{
 *   id: string,
 *   level: string
 * }>} permissionGroups
 * @param {string} action
 * @param {string} resource
 * @returns {boolean}
 */
export const can = (permissionGroups, action, resource) => {
  const rule = permissionRules[resource]

  if (!rule) {
    return false
  }

  const requiredLevel = rule.actions[action]

  if (!requiredLevel) {
    return false
  }

  const permission = permissionGroups.find((group) => group.id === rule.permissionGroup)

  if (!permission) {
    return false
  }

  return permissionLevels[permission.level] >= permissionLevels[requiredLevel]
}
