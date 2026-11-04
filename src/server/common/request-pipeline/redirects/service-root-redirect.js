import { getFormsCacheService } from '../../helpers/forms-cache/forms-cache.js'
import { isApplicationWindowOpen } from '../../helpers/application-window.js'
import { ApplicationStatus } from '../../constants/application-status.js'
import { withReferenceNumber } from '../../helpers/state/get-cache-key-helper.js'
import {
  buildRedirectUrl,
  hasMeaningfulPreSubmissionState,
  resolvePreSubmissionDestination,
  shouldHandlePreSubmission
} from './forms-status-redirect.js'

const CHECK_DETAILS_START_PAGE = '/check-details'
const SLUG_ROOT_ROUTE = '/{slug}'
export const REDIRECTION_MIN = 300
export const REDIRECTION_MAX = 399

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
 * Resolves whether this request is a candidate for the pre-submission.
 * @param {import('@hapi/hapi').Request} request
 * @returns {{ slug: string, preSubmissionRule: any, allowMultipleApplications: boolean } | null}
 */
function resolvePreSubmissionCandidate(request) {
  const slug = request.params?.slug

  if (request.method !== 'get' || request.route?.path !== SLUG_ROOT_ROUTE || !slug) {
    return null
  }

  if (!isDispatchRedirect(request.response)) {
    return null
  }

  const def = /** @type {{ startPage?: string, metadata?: Record<string, any> } | undefined} */ (
    /** @type {{ model?: { def?: unknown } }} */ (request.app).model?.def
  )

  if (def?.startPage !== CHECK_DETAILS_START_PAGE && def?.metadata?.allowMultipleApplications !== true) {
    return null
  }

  const preSubmissionRule = def.metadata?.grantRedirectRules?.preSubmission?.[0]

  if (!preSubmissionRule) {
    return null
  }

  return { slug, preSubmissionRule, allowMultipleApplications: def.metadata?.allowMultipleApplications === true }
}

/**
 * Redirects a user with an in-progress application away from the grant's start page.
 * @param {import('@hapi/hapi').Request} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {Promise<symbol | import('@hapi/hapi').ResponseObject>}
 */
export async function serviceRootRedirect(request, h) {
  try {
    const candidate = resolvePreSubmissionCandidate(request)

    if (!candidate) {
      return h.continue
    }

    const { slug, preSubmissionRule, allowMultipleApplications } = candidate

    if (!isApplicationWindowOpen(request)) {
      return h.continue
    }

    const state = await getFormsCacheService(request.server).getState(request)
    const { applicationStatus } = /** @type {{ applicationStatus?: string }} */ (state)

    // Multi-application only: a reopened application entering the grant root goes where a draft goes, so
    // every entry (selector row, superseded or typed reference) lands on the same page. Other grants keep
    // their own reopened routing.
    const reopenedMultiApplication = allowMultipleApplications && applicationStatus === ApplicationStatus.REOPENED
    if (!shouldHandlePreSubmission(applicationStatus) && !reopenedMultiApplication) {
      return h.continue
    }

    if (!hasMeaningfulPreSubmissionState(/** @type {any} */ (state))) {
      return h.continue
    }

    // Resolve the destination through the shared pre-submission gate so that,
    // for gated grants (e.g. grasslands), a returning applicant who has selected
    // a land parcel but no actions is sent to `incompleteToPath`
    // (the select-land-parcel page) rather than straight to the check-answers
    // page. Un-gated grants continue to use the rule's `toPath`.
    const destinationPath = resolvePreSubmissionDestination(preSubmissionRule, /** @type {any} */ (state))
    if (destinationPath === null) {
      return h.continue
    }

    // This extension is registered after the multi-application plugin, so its redirect is never
    // seen by that plugin's ref-reattaching hook: the ref has to be carried explicitly here.
    return h.redirect(withReferenceNumber(request, buildRedirectUrl(slug, destinationPath))).takeover()
  } catch {
    return h.continue
  }
}
