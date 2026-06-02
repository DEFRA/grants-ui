/**
 * @typedef {'VIEW' | 'AMEND' | 'SUBMIT'} PermissionLevel
 */
/**
 * @typedef {'view' | 'amend' | 'submit'} PermissionAction
 */
/**
 * @type {Record<string, {
 *   permissionGroup: string,
 *   permissions: Record<PermissionAction, PermissionLevel[]>
 * }>}
 */
export const permissionRules = /** @type {const} */ {
  csApplications: {
    permissionGroup: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',

    permissions: {
      view: ['VIEW', 'AMEND', 'SUBMIT'],
      amend: ['AMEND', 'SUBMIT'],
      submit: ['SUBMIT']
    }
  }
}
