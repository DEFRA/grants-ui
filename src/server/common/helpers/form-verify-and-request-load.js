import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { findFormBySlug } from '~/src/server/common/forms/services/find-form-by-slug.js'
import { getStateWithDefinition } from '~/src/server/common/helpers/state/state-with-definition-context.js'

/**
 * Resolves the form metadata to stamp onto `request.app.model.def.metadata`.
 *
 * YAML-sourced forms carry their metadata on the lightweight cache entry.
 * Backend-sourced forms register without metadata (it is version-specific and
 * resolved per request), so it is recovered from the nested form definition in
 * the per-request combined `POST /state/with-definition` response — i.e. from
 * `definition.definition.metadata`, not the full definition document.
 *
 * @param {AnyRequest} request
 * @param {FormCacheEntry} form
 * @returns {Promise<FormCacheEntry['metadata']>}
 */
async function resolveFormMetadata(request, form) {
  if (form.metadata) {
    return form.metadata
  }

  if (form.source === 'backend') {
    try {
      const body = await getStateWithDefinition(request)
      return body?.definition?.definition?.metadata ?? form.metadata
    } catch {
      // Leave metadata unresolved; the state/definition loaders surface the
      // underlying failure later with full context.
    }
  }

  return form.metadata
}

/**
 * Validates the request has a `slug` param and resolves the matching form
 * cache entry. Also stamps a minimal `app.model` onto the request for non-DXT
 * controllers that still need `def.metadata` available downstream.
 *
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @returns {Promise<{ error: import('@hapi/hapi').ResponseObject } | { form: FormCacheEntry, slug: string }>}
 */
export async function validateRequestAndFindForm(request, h) {
  const { slug } = request.params

  if (!slug) {
    return { error: h.response('Bad request - missing slug').code(statusCodes.badRequest).takeover() }
  }

  const form = await findFormBySlug(slug)
  if (!form) {
    return { error: h.response('Form not found').code(statusCodes.notFound).takeover() }
  }

  // For pages that do not extend the DXT controllers, this model will not be set, but it is required for retrieving the
  // correct state from backend when using form definitions loaded via config API (as version is required)
  if (!request.app?.model) {
    request.app.model = /** @type {import('@defra/forms-engine-plugin/engine/models/index.js').FormModel} */ ({
      def: {
        metadata: await resolveFormMetadata(request, form)
      }
    })
  }

  return { form, slug }
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseToolkit } from '@hapi/hapi'
 * @import { FormCacheEntry } from '~/src/server/common/forms/services/forms-redis.js'
 */
