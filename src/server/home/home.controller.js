import { config } from '~/src/config/config.js'
import { fetchAllowedGrantDetails } from '~/src/server/auth/services/allowlist.client.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { sfdUrlForOrganisation } from '~/src/server/common/helpers/sfd-url.js'

/** @param {import('../auth/services/allowlist.client.js').AllowedGrant} grant */
function toLandingPageGrant(grant) {
  return {
    title: grant.title,
    description: grant.description,
    href: `/${encodeURIComponent(grant.code)}`
  }
}

/** @satisfies {Partial<ServerRoute>} */
export const homeController = {
  async handler(request, h) {
    if (config.get('externalLinks.sfd.enabled')) {
      const configuredHomeUrl = config.get('externalLinks.sfd.homeUrl')
      const sfdHomeUrl = sfdUrlForOrganisation(configuredHomeUrl, request)
      if (sfdHomeUrl) {
        return h.redirect(sfdHomeUrl)
      }
      const homeUrl = typeof configuredHomeUrl === 'string' ? configuredHomeUrl.trim() : ''
      log(LogCodes.SYSTEM.SFD_HOME_URL_MISSING_ON_REDIRECT, { homeUrl }, request)
    }

    const { crn, sbi, organisationName } = /** @type {LandingPageCredentials} */ (request.auth.credentials)
    const grants = await fetchAllowedGrantDetails(crn, sbi)

    return h.view('home', {
      pageTitle: 'Grants available to you',
      organisationName,
      grants: grants.map(toLandingPageGrant).sort((left, right) => left.title.localeCompare(right.title))
    })
  }
}

export const indexController = {
  handler(request, h) {
    if (request.auth.isAuthenticated) {
      return h.redirect('/home')
    }
    return h.view('root', {
      pageTitle: 'Index',
      heading: 'Index'
    })
  }
}

/**
 * @typedef {{ crn: string, sbi: string, organisationName?: string, currentRelationshipId?: string }} LandingPageCredentials
 * @import { ServerRoute } from '@hapi/hapi'
 */
