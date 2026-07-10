import { getFormsCacheService } from '../../helpers/forms-cache/forms-cache.js'
import { buildRedirectUrl, hasMeaningfulState, shouldHandlePreSubmission } from './forms-status-redirect.js'

const CHECK_DETAILS_START_PAGE = '/check-details'
const SLUG_ROOT_ROUTE = '/{slug}'
const REDIRECTION_MIN = 300
const REDIRECTION_MAX = 399

/**
 * Determines whether the response is the forms-engine-plugin's own start-page redirect.
 *
 * @param {unknown} response
 * @returns {boolean}
 */
function isDispatchRedirect(response) {
  const candidate = /** @type {{ isBoom?: boolean, statusCode?: number } | null | undefined} */ (response)

  if (!candidate || candidate.isBoom) {
    return false
  }

  const { statusCode } = candidate

  return typeof statusCode === 'number' && statusCode >= REDIRECTION_MIN && statusCode <= REDIRECTION_MAX
}

/**
 * Redirects a user with an in-progress application away from the grant's start page.
 * @param {import('@hapi/hapi').Request} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {Promise<symbol | import('@hapi/hapi').ResponseObject>}
 */
export async function serviceRootRedirect(request, h) {
  try {
    const slug = request.params?.slug

    if (request.method !== 'get' || request.route?.path !== SLUG_ROOT_ROUTE || !slug) {
      return h.continue
    }

    if (!isDispatchRedirect(request.response)) {
      return h.continue
    }

    const def = /** @type {{ startPage?: string, metadata?: Record<string, any> } | undefined} */ (
      /** @type {{ model?: { def?: unknown } }} */ (request.app).model?.def
    )

    if (def?.startPage !== CHECK_DETAILS_START_PAGE) {
      return h.continue
    }

    const preSubmissionRule = def.metadata?.grantRedirectRules?.preSubmission?.[0]

    if (!preSubmissionRule) {
      return h.continue
    }

    const state = await getFormsCacheService(request.server).getState(request)

    if (!shouldHandlePreSubmission(/** @type {{ applicationStatus?: string }} */ (state).applicationStatus)) {
      return h.continue
    }

    if (!hasMeaningfulState(/** @type {any} */ (state))) {
      return h.continue
    }

    return h.redirect(buildRedirectUrl(slug, preSubmissionRule.toPath)).takeover()
  } catch {
    return h.continue
  }
}
