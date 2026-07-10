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
          const redirectUrl = request.yar.get(SFD_REDIRECT_SESSION_KEY)
          request.yar.clear(SFD_REDIRECT_SESSION_KEY)

          return redirectUrl ? h.redirect(redirectUrl) : h.redirect('/')
        }
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
