import { config } from '~/src/config/config.js'

export const SFD_REDIRECT_SESSION_KEY = 'sfdRedirectUrl'
export const SFD_REDIRECT_PATH = '/sfd-redirect'

export const sfdRedirect = {
  plugin: {
    name: 'sfd-redirect',
    register(server) {
      server.route({
        method: 'GET',
        path: SFD_REDIRECT_PATH,
        handler: (request, h) => {
          const { returnPath = '/' } = request.yar.get(SFD_REDIRECT_SESSION_KEY) ?? {}
          request.yar.clear(SFD_REDIRECT_SESSION_KEY)
          const updateUrl = config.get('externalLinks.sfd.updateUrl')?.trim()

          if (!updateUrl || !URL.canParse(updateUrl)) {
            return h.redirect(returnPath)
          }

          const url = new URL(updateUrl)
          url.searchParams.set('ssoOrgId', request.auth.credentials.currentRelationshipId)
          return h.view('sfd-redirect', { redirectUrl: url.toString() })
        }
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
