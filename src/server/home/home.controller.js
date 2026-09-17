import { config } from '~/src/config/config.js'
import { fetchAllowedGrantDetails } from '~/src/server/auth/services/allowlist.client.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

/** @param {unknown} value */
function validHttpUrl(value) {
  if (typeof value !== 'string' || !URL.canParse(value)) {
    return false
  }
  return HTTP_PROTOCOLS.has(new URL(value).protocol)
}

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
      const homeUrl = typeof configuredHomeUrl === 'string' ? configuredHomeUrl.trim() : ''
      if (validHttpUrl(homeUrl)) {
        return h.redirect(homeUrl)
      }
      log(LogCodes.SYSTEM.SFD_HOME_URL_MISSING_ON_REDIRECT, { homeUrl: homeUrl ?? '' }, request)
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
 * @typedef {{ crn: string, sbi: string, organisationName?: string }} LandingPageCredentials
 * @import { ServerRoute } from '@hapi/hapi'
 */
