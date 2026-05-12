export const permissionRules = {
  csApplications: {
    permissionGroup: 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS',

    actions: {
      view: 'VIEW',
      amend: 'AMEND',
      submit: 'SUBMIT'
    }
  },

  csAgreements: {
    permissionGroup: 'COUNTRYSIDE_STEWARDSHIP_AGREEMENTS',

    actions: {
      view: 'VIEW',
      amend: 'AMEND',
      submit: 'SUBMIT'
    }
  },

  landDetails: {
    permissionGroup: 'LAND_DETAILS',

    actions: {
      view: 'VIEW',
      amend: 'AMEND'
    }
  },

  businessDetails: {
    permissionGroup: 'BUSINESS_DETAILS',

    actions: {
      view: 'VIEW',
      amend: 'AMEND',
      submit: 'FULL_PERMISSION'
    }
  }
}
