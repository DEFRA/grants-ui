import { YarKeys } from '../../constants/session-keys.js'
import { isApplicationWindowOpen } from '../../helpers/application-window.js'
import { shouldHandlePreSubmission } from './forms-status-redirect.js'

/**
 * Resolves where a new or draft applicant should be sent when the grant's application window is closed.
 * @param {import('../types.js').PipelineRequest & import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} request
 * @param {import('@defra/forms-engine-plugin/engine/types.js').FormContext} context
 * @returns {string | null} The application-window-closed path to redirect to, or `null` to continue
 */
export function resolveApplicationWindowClosedPath(request, context) {
  const def = /** @type {{ name?: string } | undefined} */ (
    /** @type {{ model?: { def?: unknown } }} */ (request.app).model?.def
  )

  if (isApplicationWindowOpen(request)) {
    return null
  }

  const previousStatus = /** @type {string | undefined} */ (context.state?.applicationStatus)

  if (!shouldHandlePreSubmission(previousStatus)) {
    return null
  }

  const basePath = request.params.slug ? `/${request.params.slug}` : ''

  if (request.path === `${basePath}/application-window-closed`) {
    return null
  }

  const schemeNames = /** @type {Record<string, string | undefined> | undefined} */ (
    request.yar.get(YarKeys.APPLICATION_WINDOW_CLOSED_SCHEME_NAME)
  )
  request.yar.set(YarKeys.APPLICATION_WINDOW_CLOSED_SCHEME_NAME, {
    ...schemeNames,
    [request.params.slug]: def?.name
  })

  return `${basePath}/application-window-closed`
}
