import { findFormBySlug } from '~/src/server/common/forms/services/find-form-by-slug.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'

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

          return h.view('incorrect-details', {
            pageTitle: 'Update your details',
            serviceName: form.title,
            serviceUrl: `/${slug}`,
            backLink: { href: `/${slug}/check-details` },
            incorrectDetailsContent: metadata.incorrectDetailsContent ?? null,
            supportEmail: metadata.supportEmail ?? null
          })
        }
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
