import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { findFormBySlug } from '~/src/server/common/forms/services/find-form-by-slug.js'

export async function validateRequestAndFindForm(request, h) {
  const { slug } = request.params

  if (!slug) {
    return { error: h.response('Bad request - missing slug').code(statusCodes.badRequest) }
  }

  const form = await findFormBySlug(slug)
  if (!form) {
    return { error: h.response('Form not found').code(statusCodes.notFound) }
  }

  // For pages that do not extend the DXT controllers, this model will not be set, but it is required for retrieving the
  // correct state from backend when using form definitions loaded via config API (as version is required)
  if (!request.app?.model) {
    request.app.model = {
      def: {
        metadata: form.metadata
      }
    }
  }

  return { form, slug }
}
