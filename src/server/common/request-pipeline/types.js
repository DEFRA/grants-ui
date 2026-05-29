/**
 * @typedef {import('@hapi/hapi').Request & {
 *   can: (action: string, resource: string) => boolean
 * }} AuthorisedRequest
 */

/**
 * @typedef {{
 *   metadata?: {
 *     permissions?: {
 *       enforce?: boolean
 *     }
 *   }
 * }} PermissionAwareDefinition
 */

export {}
