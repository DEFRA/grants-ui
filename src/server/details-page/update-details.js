import { findFormBySlug } from '~/src/server/common/forms/services/find-form-by-slug.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { config } from '~/src/config/config.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * Registers GET /{slug}/update-details. Rendered when the user indicates on
 * /{slug}/check-details that their details are incorrect and the controller
 * redirects here so the browser URL reflects the state they're in.
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const updateDetails = {
  plugin: {
    name: 'update-details',
    register(server) {
      server.route({
        method: 'GET',
        path: '/{slug}/update-details',
        handler: async (request, h) => {
          const { slug } = request.params
          const form = await findFormBySlug(slug)

          if (!form) {
            return h.response('Form not found').code(statusCodes.notFound)
          }

          const metadata = /** @type {Record<string, unknown>} */ (form.metadata ?? {})
          const isSFDUpdateEnabled = config.get('externalLinks.sfd.enabled')
          const updateThroughSFDUrl = isSFDUpdateEnabled ? getSFDUpdateURL(request) : undefined

          if (isSFDUpdateEnabled && updateThroughSFDUrl) {
            return h.redirect(updateThroughSFDUrl)
          } else {
            return h.view('update-details', {
              pageTitle: 'Update your details',
              serviceName: form.title,
              serviceUrl: `/${slug}`,
              backLink: { href: `/${slug}/check-details` },
              incorrectDetailsContent: metadata.incorrectDetailsContent ?? null
            })
          }
        }
      })
    }
  }
}

function getSFDUpdateURL(request) {
  const { organisationId } = request.auth.credentials
  const updateUrl = config.get('externalLinks.sfd.updateUrl')
  if (!updateUrl) {
    return ''
  }

  try {
    const url = new URL(updateUrl)
    url.searchParams.set('ssoOrgId', organisationId)
    return url.toString()
  } catch (error) {
    debug(LogCodes.SYSTEM.CONFIG_INVALID, { key: 'externalLinks.sfd.updateUrl', value: updateUrl }, request)
    return ''
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
