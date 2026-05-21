import { permissionPaths, requirePermission } from './require-permission.js'

import { canSubmitCsApplication } from '../countryside-stewardship.permissions.js'

export const requireCsSubmitPermission = requirePermission({
  permission: 'submit',
  isAuthorised: canSubmitCsApplication,
  onFail: (_request, h, { returnUrl }) => {
    const redirectUrl = returnUrl
      ? `${permissionPaths.cannotSubmit}?returnUrl=${encodeURIComponent(returnUrl)}`
      : permissionPaths.cannotSubmit
    return h.redirect(redirectUrl).takeover()
  }
})
