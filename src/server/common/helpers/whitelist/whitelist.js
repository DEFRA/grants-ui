import { WhitelistServiceFactory } from '~/src/server/auth/services/whitelist.service.js'
import { getAllForms } from '~/src/server/dev-tools/utils/index.js'

export default {
  plugin: {
    name: 'whitelist',
    register: (server) => {
      server.ext('onPostAuth', (request, h) => whitelistHandler(request, h))
    }
  }
}

const whitelistHandler = (request, h) => {
  if (!request.auth.isAuthenticated) {
    return h.continue
  }

  const crn = request.auth.credentials.crn
  const sbi = request.auth.credentials.sbi

  const grantMetadata = getAllForms().find((form) => form.slug === request.params.slug)?.metadata

  const whitelistService = WhitelistServiceFactory.getService(grantMetadata)
  const validation = whitelistService.validateGrantAccess(crn, sbi)

  whitelistService.logWhitelistValidation({
    crn,
    sbi,
    path: request.path,
    crnPassesValidation: validation.crnPassesValidation,
    sbiPassesValidation: validation.sbiPassesValidation,
    hasCrnValidation: validation.hasCrnValidation,
    hasSbiValidation: validation.hasSbiValidation
  })

  if (!validation.overallAccess) {
    return h.redirect(`/auth/journey-unauthorised`).takeover()
  }
  return h.continue
}
