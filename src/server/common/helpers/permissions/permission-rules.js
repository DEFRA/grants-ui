export const permissionRules = {
  csApplications: {
    permissionGroup: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',

    permissions: {
      view: 'VIEW',
      amend: 'AMEND',
      submit: 'SUBMIT'
    }
  },

  csAgreements: {
    permissionGroup: 'COUNTRYSIDE_STEWARDSHIP_AGREEMENTS',

    permissions: {
      view: 'VIEW',
      amend: 'AMEND',
      submit: 'SUBMIT'
    }
  },

  landDetails: {
    permissionGroup: 'LAND_DETAILS',

    permissions: {
      view: 'VIEW',
      amend: 'AMEND'
    }
  },

  businessDetails: {
    permissionGroup: 'BUSINESS_DETAILS',

    permissions: {
      view: 'VIEW',
      amend: 'AMEND',
      submit: 'FULL_PERMISSION'
    }
  }
}
