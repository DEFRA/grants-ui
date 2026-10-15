/**
 * @typedef {'VIEW' | 'AMEND' | 'SUBMIT' | 'MAKE_LEGAL_CHANGES' | 'FULL_PERMISSION'} PermissionLevel
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
  },
  csAgreements: {
    permissionGroup: 'COUNTRYSIDE_STEWARDSHIP_AGREEMENTS',

    permissions: {
      view: ['VIEW', 'AMEND', 'SUBMIT'],
      amend: ['AMEND', 'SUBMIT'],
      submit: ['SUBMIT']
    }
  },
  businessDetails: {
    permissionGroup: 'BUSINESS_DETAILS',

    permissions: {
      view: ['MAKE_LEGAL_CHANGES', 'FULL_PERMISSION'],
      amend: ['MAKE_LEGAL_CHANGES', 'FULL_PERMISSION'],
      submit: ['MAKE_LEGAL_CHANGES', 'FULL_PERMISSION']
    }
  }
}
