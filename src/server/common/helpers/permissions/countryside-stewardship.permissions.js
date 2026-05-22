import { can } from './can.js'

export const canViewCsApplication = (permissions) => can(permissions, 'view', 'csApplications')

export const canAmendCsApplication = (permissions) => can(permissions, 'amend', 'csApplications')

export const canSubmitCsApplication = (permissions) => can(permissions, 'submit', 'csApplications')
