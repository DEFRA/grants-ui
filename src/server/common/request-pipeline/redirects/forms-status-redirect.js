import { forbidden } from '@hapi/boom'
import { ApplicationStatus } from '../../constants/application-status.js'
import { statusCodes } from '../../constants/status-codes.js'
import { getFormsCacheService } from '../../helpers/forms-cache/forms-cache.js'
import { updateApplicationStatus } from '../../helpers/status/update-application-status-helper.js'
import { getApplicationStatus } from '../../services/grant-application/grant-application.service.js'
import { log, LogCodes } from '../../helpers/logging/log.js'
import { mintLockToken } from '../../helpers/lock/lock-token.js'
import { getCacheKey } from '../../helpers/state/get-cache-key-helper.js'
import agreements from '~/src/config/agreements.js'
import { getGrantCode } from '../../helpers/grant-code.js'
import { YarKeys } from '../../constants/session-keys.js'

const APPLICATION_NOT_SUBMITTED_MESSAGE = 'Application not submitted'

/** @type {StateGuard[]} */
const POST_SUBMISSION_PAGE_STATE_GUARDS = [
  {
    stateKey: 'applicationStatus',
    expectedValue: ApplicationStatus.SUBMITTED,
    paths: ['confirmation', 'print-submitted-application'],
    redirectTo: '/start',
    failure: 'forbidden',
    message: APPLICATION_NOT_SUBMITTED_MESSAGE
  }
]

/**
 * @typedef {Object} RedirectRule
 * @property {string} fromGrantsStatus - Grants UI status or comma-separated statuses or 'default'
 * @property {string} gasStatus - GAS status or 'default'
 * @property {string} toGrantsStatus - Grants UI status to update to
 * @property {string} toPath - URL path to redirect the user to
 */

/**
 * Finds the first redirect rule that matches the given Grants UI status
 * and GAS (Grant Administration System) status.
 *
 * If a rule uses 'default', it matches any status for that field.
 *
 * @param {string} fromGrantsStatus - Current status in the Grants UI (previous state)
 * @param {string} gasStatus - Current status returned from GAS
 * @param {RedirectRule[]} redirectRules - Array of redirect rule objects to match against
 * @returns {RedirectRule} The first matching redirect rule
 * @throws {Error} If no matching rule is found
 *
 * @example
 * const rule = mapStatusToUrl('SUBMITTED', 'APPLICATION_AMEND', redirectRules);
 * console.log(rule.toPath); // e.g., '/summary'
 */
function mapStatusToUrl(fromGrantsStatus, gasStatus, redirectRules = []) {
  const match = redirectRules.find((rule) => {
    const fromStatuses = new Set((rule.fromGrantsStatus || 'default').split(',').map((s) => s.trim()))
    const gasStatuses = new Set((rule.gasStatus || 'default').split(',').map((s) => s.trim()))

    const fromMatch = fromStatuses.has(fromGrantsStatus) || fromStatuses.has('default')
    const gasMatch = gasStatuses.has(gasStatus) || gasStatuses.has('default')

    return fromMatch && gasMatch
  })

  if (!match) {
    throw new Error(`No redirect rule found for fromGrantsStatus=${fromGrantsStatus} gasStatus=${gasStatus}`)
  }

  return match
}

/**
 * Persists the new status to the appropriate storage
 * Uses cache service for CLEARED status, otherwise updates application status
 * @param {AnyFormRequest} request - The Hapi forms request object
 * @param {string} newStatus - The new status to persist
 * @param {string} previousStatus - The previous status for comparison
 * @param {string} grantId - The grant ID
 * @param {FormSubmissionState} existingState - The existing state to preserve when updating session cache
 * @returns {Promise<void>}
 */
async function persistStatus(request, newStatus, previousStatus, grantId, existingState = {}) {
  if (newStatus === previousStatus) {
    return
  }

  const organisationId = request.auth.credentials?.sbi

  const cacheService = getFormsCacheService(request.server)

  if (newStatus === ApplicationStatus.CLEARED) {
    await cacheService.setState(request, {
      applicationStatus: newStatus
    })
  }

  if (newStatus === ApplicationStatus.REOPENED) {
    // eslint-disable-next-line camelcase
    const { $$__referenceNumber, applicationStatus, ...rest } = existingState

    await cacheService.setState(
      request,
      /** @type {FormSubmissionState} */ (
        /** @type {unknown} */ ({
          ...rest,
          // eslint-disable-next-line camelcase
          previousReferenceNumber: $$__referenceNumber,
          applicationStatus: newStatus
        })
      )
    )
  }

  if (newStatus !== ApplicationStatus.CLEARED) {
    const { sbi, grantCode } = getCacheKey(request)
    const grantVersion = /** @type {string | number | undefined} */ (request.app.model?.def?.metadata?.version) ?? 1 // Default to 1 to support non-config broker grants
    const contactId = request.auth?.credentials?.contactId || request.auth?.credentials?.crn

    if (!contactId) {
      throw new Error('Missing user identity (contactId/crn) for lock token')
    }

    const lockToken = mintLockToken({
      userId: String(contactId),
      sbi,
      grantCode,
      grantVersion
    })

    await updateApplicationStatus(
      newStatus,
      `${organisationId}:${grantId}`,
      /** @type {{ lockToken?: string, grantVersion?: string }} */ ({ lockToken, grantVersion })
    )
  }
}

/**
 * Determines if the state contains any meaningful values other than the base keys.
 * @param {FormSubmissionState} state - The state object to check
 * @returns {boolean} - True if state contains meaningful values, otherwise false
 */
function hasMeaningfulState(state) {
  const baseStateKeys = new Set(['$$__referenceNumber', 'applicationStatus', 'additionalAnswers'])

  // TODO remove workaround for state clearing bug when SFIR-647 are complete
  const farmPaymentsStateKeys = new Set(['selectedLandParcel'])
  for (const key of farmPaymentsStateKeys) {
    baseStateKeys.add(key)
  }
  if (!Object.keys(state.landParcels || {}).length) {
    baseStateKeys.add('landParcels')
  }
  // end workaround

  return Object.keys(state).some((k) => !baseStateKeys.has(k))
}

/**
 * Determines if the current request is for the start page of a grant.
 * @param {AnyRequest} request - The Hapi request object
 * @param {FormContext} context - The context object containing paths and state
 * @returns {boolean} - True if the current request is for the start page of a grant, otherwise false
 */
function isFormsStartPage(request, context) {
  const slug = request.params?.slug
  const startPath = context.paths?.[0]
  const currentPath = request.path

  if (!slug || !startPath) {
    return false
  }

  return currentPath === `/${slug}${startPath}`
}

/**
 * Determines if a pre-submission request should redirect to the "check answers" page.
 *
 * If there is any meaningful state and the user has navigated to the "start" page, redirect to the "check answers" page
 * Otherwise just continue
 *
 * @param {AnyRequest} request - Hapi request object
 * @param {ResponseToolkit} h - Hapi response toolkit
 * @param {FormContext} context - { paths: ['/start'], state: { applicationStatus: 'CLEARED' } }
 * @returns {symbol | import('@hapi/hapi').ResponseObject} - h.continue if no redirect is required, otherwise a redirect response
 */
function preSubmissionRedirect(request, h, context) {
  const grantId = request.params?.slug
  const grantRedirectRules = /** @type {GrantRedirectRules | undefined} */ (
    request.app.model?.def?.metadata?.grantRedirectRules
  )

  const guardRedirect = checkStateGuards(request, h, context, grantRedirectRules)
  // checkStateGuards returns either h.continue (symbol) or a takeover ResponseObject; the !== distinguishes them and is intentional.
  const guardProducedRedirect = guardRedirect !== h.continue // NOSONAR S2159
  if (guardProducedRedirect) {
    return guardRedirect
  }

  const preSubmissionRedirectRule = grantRedirectRules?.preSubmission?.[0]
  if (!preSubmissionRedirectRule) {
    return h.continue
  }
  const preSubmissionRedirectUrl = preSubmissionRedirectRule.toPath.startsWith('/')
    ? `/${grantId}${preSubmissionRedirectRule.toPath}`
    : `/${grantId}/${preSubmissionRedirectRule.toPath}`

  if (hasMeaningfulState(context.state) && isFormsStartPage(request, context)) {
    return h.redirect(preSubmissionRedirectUrl).takeover()
  }
  return h.continue
}

/**
 * Reads a dot-delimited value from form state.
 *
 * @param {FormSubmissionState} state
 * @param {string} stateKey
 * @returns {unknown}
 */
function getStateValue(state, stateKey) {
  return stateKey.split('.').reduce((value, key) => {
    if (value === undefined || value === null || typeof value !== 'object') {
      return undefined
    }

    return /** @type {Record<string, unknown>} */ (value)[key]
  }, /** @type {unknown} */ (state))
}

/**
 * Determines whether a guard applies to the current request path.
 *
 * @param {StateGuard} guard
 * @param {string | undefined} currentPath
 * @returns {boolean}
 */
function doesGuardApplyToPath(guard, currentPath) {
  if (!guard.paths?.length) {
    return true
  }

  return typeof currentPath === 'string' && guard.paths.includes(currentPath)
}

/**
 * Determines whether the current state satisfies a guard.
 *
 * @param {unknown} value
 * @param {StateGuard} guard
 * @returns {boolean}
 */
function doesStateMatchGuard(value, guard) {
  const hasRequiredState = value !== undefined && value !== null

  if (!hasRequiredState) {
    return false
  }

  if ('expectedValue' in guard) {
    return value === guard.expectedValue
  }

  return true
}

/**
 * Produces the configured state guard failure response.
 *
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @param {StateGuard} guard
 * @returns {import('@hapi/hapi').ResponseObject}
 */
function failStateGuard(request, h, guard) {
  if (guard.failure === 'forbidden') {
    throw forbidden(guard.message ?? APPLICATION_NOT_SUBMITTED_MESSAGE)
  }

  const grantId = request.params?.slug
  const redirectUrl = buildRedirectUrl(grantId, guard.redirectTo)
  return h.redirect(redirectUrl).takeover()
}

/**
 * Checks state guards defined in grantRedirectRules.stateGuards.
 * If a guard's required state is missing or does not match the expected value
 * and the current path is not in the guard's allowedPaths, it applies the guard failure response.
 *
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @param {FormContext} context
 * @param {GrantRedirectRules} [grantRedirectRules]
 * @param {StateGuardOptions} [options]
 * @returns {symbol|import('@hapi/hapi').ResponseObject} h.continue or a redirect
 */
function checkStateGuards(request, h, context, grantRedirectRules, options = {}) {
  const stateGuards = grantRedirectRules?.stateGuards
  if (!stateGuards?.length) {
    return h.continue
  }

  const currentPath = request.params?.path

  for (const guard of stateGuards) {
    if (options.pathScopedOnly && !guard.paths?.length) {
      continue
    }

    if (!doesGuardApplyToPath(guard, currentPath)) {
      continue
    }

    const value = getStateValue(context.state, guard.stateKey)
    const isAllowedPath = typeof currentPath === 'string' && guard.allowedPaths?.includes(currentPath)

    if (!doesStateMatchGuard(value, guard) && !isAllowedPath) {
      return failStateGuard(request, h, guard)
    }
  }

  return h.continue
}

/**
 * Determines whether the pre-submission redirect logic should run.
 *
 * @param {string | undefined} previousStatus - The previous application status stored in the session or state.
 * @returns {boolean} `true` if the application has no previous status or was cleared/reopened, otherwise `false`.
 */
function shouldHandlePreSubmission(previousStatus) {
  return !previousStatus || previousStatus === ApplicationStatus.CLEARED
}

/**
 * Determines whether a submitted or reopened application should be checked against GAS.
 *
 * @param {string | undefined} previousStatus - The previous application status stored in the session or state.
 * @returns {previousStatus is string} `true` when post-submission redirect handling should run.
 */
function shouldHandlePostSubmission(previousStatus) {
  return previousStatus === ApplicationStatus.SUBMITTED || previousStatus === ApplicationStatus.REOPENED
}

/**
 * Determines whether redirect handling should be skipped for the current request.
 *
 * @param {AnyFormRequest} request - The Hapi forms request object.
 * @param {FormContext} context - The request context containing state and reference data.
 * @param {GrantRedirectRules} [grantRedirectRules] - The redirect rules configuration from metadata.
 * @returns {boolean} `true` when the pipeline should continue without redirect handling.
 */
function shouldSkipFormsStatusRedirect(request, context, grantRedirectRules) {
  const isPostSubmission = context.state.applicationStatus === ApplicationStatus.SUBMITTED
  const isWithinGrantPages = request.headers['sec-fetch-site'] === 'same-origin'
  const isCheckDetailsStartPage = request.app.model?.def?.startPage === '/check-details'
  const currentPath = request.params?.path
  const currentPathIsExcluded = Boolean(currentPath && grantRedirectRules?.excludedPaths?.includes(currentPath))
  const hasCheckDetailsChangesPending = context.state.checkDetailsChangesPending === true

  return (
    currentPathIsExcluded ||
    (isWithinGrantPages && !isPostSubmission) ||
    (hasCheckDetailsChangesPending && isCheckDetailsStartPage)
  )
}

/**
 * Builds a redirect URL for a given grant ID and path.
 *
 * @param {string} grantId - The unique identifier (slug) of the grant.
 * @param {string} path - The redirect path defined in the grant redirect rules.
 * @returns {string} A formatted URL combining the grant ID and path.
 *
 * @example
 * buildRedirectUrl('grant-a', '/summary') // "/grant-a/summary"
 * buildRedirectUrl('grant-a', 'summary')  // "/grant-a/summary"
 */
function buildRedirectUrl(grantId, path) {
  return path.startsWith('/') ? `/${grantId}${path}` : `/${grantId}/${path}`
}

/**
 * Handles post-submission redirects and status updates after a form has been submitted.
 *
 * ARCHITECTURAL NOTE
 *
 * This function currently performs both:
 *
 * 1. Redirect/state transition resolution
 *    - calls GAS
 *    - evaluates redirect rules
 *    - determines destination
 *
 * 2. Side effects
 *    - persists Grants UI application status
 *    - updates session (YAR) context
 *
 * As a result, state changes may occur before downstream
 * permission enforcement executes.
 *
 * This behaviour is currently accepted as a tactical compromise.
 *
 * Future work (https://eaflood.atlassian.net/browse/TGC-1412)
 * is expected to move application state transitions
 * to an event-driven model (SNS/SQS) where transition decisions
 * are separated from side-effect execution.
 *
 * Until that work is completed:
 * - avoid adding additional state mutations here
 * - avoid introducing new external side effects
 * - keep this function limited to existing persistence behaviour
 *
 * Any new state-changing behaviour should be considered carefully
 * and discussed with the team before being added.
 *
 * @async
 * @param {AnyFormRequest} request - The Hapi forms request object.
 * @param {ResponseToolkit} h - The Hapi response toolkit.
 * @param {FormContext} context - The request context containing state and reference data.
 * @param {string} previousStatus - The previous application status (e.g. "SUBMITTED").
 * @param {string} grantCode - The grant code used to fetch status from GAS.
 * @param {GrantRedirectRules} [grantRedirectRules] - The redirect rules configuration from metadata.
 * @returns {Promise<import('@hapi/hapi').ResponseObject | symbol>} A redirect or `h.continue`.
 *
 * @throws {Error} If GAS returns an unexpected response or no redirect rule matches.
 */
async function handlePostSubmission(request, h, context, previousStatus, grantCode, grantRedirectRules) {
  const grantId = request.params?.slug
  const clientRef = resolveClientReference(previousStatus, context)

  const response = await getApplicationStatus(grantCode, clientRef.toLowerCase(), request)

  const { status: gasStatus } = await response.json()

  const postSubmissionRules = grantRedirectRules?.postSubmission ?? []
  const rule = mapStatusToUrl(previousStatus, gasStatus, postSubmissionRules)

  await persistStatus(request, rule.toGrantsStatus, previousStatus, grantId, context.state)

  const isAgreementsRedirect = rule.toPath === agreements.get('baseUrl')
  const redirectUrl = isAgreementsRedirect ? rule.toPath : buildRedirectUrl(grantId, rule.toPath)

  const grantVersion = /** @type {{ grantVersion?: string | number | null }} */ (request.app).grantVersion ?? '1.0.0'
  request.yar.set(YarKeys.GRANT_APPLICATION_CONTEXT, { grantCode, grantVersion, clientRef: clientRef.toLowerCase() })

  return request.path === redirectUrl ? h.continue : h.redirect(redirectUrl).takeover()
}

/**
 * Handles errors that occur during post-submission redirect processing.
 * Falls back to a default redirect rule if available.
 *
 * @param {Error & { status?: number }} err - The error thrown during post-submission handling.
 * @param {AnyRequest} request - The Hapi request object.
 * @param {ResponseToolkit} h - The Hapi response toolkit.
 * @param {FormContext} context - The request context containing state and reference data.
 * @param {string} grantId - The grant slug identifying the grant type.
 * @param {string} grantCode - The grant code used in GAS lookups.
 * @param {GrantRedirectRules} [grantRedirectRules] - The redirect rules configuration from metadata.
 * @returns {import('@hapi/hapi').ResponseObject | symbol} A fallback redirect or `h.continue`.
 */
function handlePostSubmissionError(err, request, h, context, grantId, grantCode, grantRedirectRules) {
  if (err.status === statusCodes.notFound) {
    return h.continue
  }

  log(
    LogCodes.SUBMISSION.SUBMISSION_REDIRECT_FAILURE,
    {
      grantType: grantCode,
      referenceNumber: context.referenceNumber,
      errorMessage: err.message
    },
    request
  )

  const fallbackRule = mapStatusToUrl('default', 'default', grantRedirectRules?.postSubmission ?? [])
  const fallbackUrl = buildRedirectUrl(grantId, fallbackRule.toPath)

  return request.path === fallbackUrl ? h.continue : h.redirect(fallbackUrl).takeover()
}

/**
 * Builds the values needed for forms status redirect handling.
 *
 * @param {AnyFormRequest} request - The Hapi forms request object.
 * @param {FormContext} context - The request context containing state and reference data.
 * @returns {FormsStatusRedirectContext | undefined} Redirect context when a grant slug is present.
 */
function getFormsStatusRedirectContext(request, context) {
  const grantId = request.params?.slug
  if (!grantId) {
    return undefined
  }

  const metadata = /** @type {{ grantRedirectRules?: GrantRedirectRules } | undefined} */ (
    request.app.model?.def?.metadata
  )

  return {
    grantId,
    grantCode: getGrantCode(request),
    previousStatus: /** @type {string | undefined} */ (context.state.applicationStatus),
    grantRedirectRules: metadata?.grantRedirectRules
  }
}

/**
 * Applies guards for routes that should only be reachable after submission.
 *
 * @param {AnyFormRequest} request - The Hapi forms request object.
 * @param {ResponseToolkit} h - The Hapi response toolkit.
 * @param {FormContext} context - The request context containing state and reference data.
 * @returns {symbol|import('@hapi/hapi').ResponseObject} h.continue or a guard failure response.
 */
function checkProtectedPageGuard(request, h, context) {
  return checkStateGuards(
    request,
    h,
    context,
    { stateGuards: POST_SUBMISSION_PAGE_STATE_GUARDS },
    { pathScopedOnly: true }
  )
}

/**
 * Handles post-submission redirects and converts failures into the configured fallback redirect.
 *
 * @param {AnyFormRequest} request - The Hapi forms request object.
 * @param {ResponseToolkit} h - The Hapi response toolkit.
 * @param {FormContext} context - The request context containing state and reference data.
 * @param {FormsStatusRedirectContext & { previousStatus: string }} redirectContext - Redirect context with a submitted or reopened status.
 * @returns {Promise<import('@hapi/hapi').ResponseObject | symbol>} A redirect or `h.continue`.
 */
async function handlePostSubmissionWithFallback(request, h, context, redirectContext) {
  try {
    return await handlePostSubmission(
      request,
      h,
      context,
      redirectContext.previousStatus,
      redirectContext.grantCode,
      redirectContext.grantRedirectRules
    )
  } catch (err) {
    return handlePostSubmissionError(
      err,
      request,
      h,
      context,
      redirectContext.grantId,
      redirectContext.grantCode,
      redirectContext.grantRedirectRules
    )
  }
}

/**
 * Runs the forms status redirect decision tree once request context is available.
 *
 * @param {AnyFormRequest} request - The Hapi forms request object.
 * @param {ResponseToolkit} h - The Hapi response toolkit.
 * @param {FormContext} context - The request context containing state and reference data.
 * @param {FormsStatusRedirectContext | undefined} redirectContext - Redirect context when a grant slug is present.
 * @returns {Promise<import('@hapi/hapi').ResponseObject | symbol>} A redirect or `h.continue`.
 */
async function handleFormsStatusRedirect(request, h, context, redirectContext) {
  if (!redirectContext) {
    return h.continue
  }

  const protectedPageGuard = checkProtectedPageGuard(request, h, context)
  const protectedPageGuardProducedResponse = protectedPageGuard !== h.continue // NOSONAR S2159
  if (protectedPageGuardProducedResponse) {
    return protectedPageGuard
  }

  const { previousStatus, grantRedirectRules } = redirectContext

  /** Don't redirect if page is listed in the grant config excludedPaths
   * or if the request is from within the grant pages (e.g. user refreshing the page or navigating using the back button)
   * or check details changes are pending
   * NOTE: Some older OS versions and browsers don't support sec-fetch-site header, so the isWithinGrantPages check is
   * not 100% reliable, but it provides an additional layer of protection against redirect loops while still allowing
   * the excludedPaths configuration to work as intended for most users.
   * isWithinGrantPages is intentionally NOT applied when the application is already submitted: there is no
   * in-progress journey to protect from redirect loops, so the post-submission redirect must always run.
   */
  if (shouldSkipFormsStatusRedirect(request, context, grantRedirectRules)) {
    return h.continue
  }

  if (shouldHandlePreSubmission(previousStatus)) {
    return preSubmissionRedirect(request, h, context)
  }

  if (!shouldHandlePostSubmission(previousStatus)) {
    return h.continue
  }

  return handlePostSubmissionWithFallback(request, h, context, {
    ...redirectContext,
    previousStatus
  })
}

/**
 * Main redirect for handling form status transitions.
 *
 * @param {import('../types.js').PipelineRequest & AnyFormRequest} request - Hapi request object (extended to include app.model)
 * @param {ResponseToolkit} h - Hapi response toolkit
 * @param {FormContext} context - Current page context including form state and reference number
 * @returns {Promise<import('@hapi/hapi').ResponseObject | any>} Hapi response or continue symbol
 */
export const formsStatusRedirect = async (request, h, context) =>
  handleFormsStatusRedirect(request, h, context, getFormsStatusRedirectContext(request, context))

/**
 * Resolves which client reference number should be used when calling GAS.
 *
 * When an application has been reopened, Grants UI stores the previous
 * reference number so GAS can still identify the original submission.
 * In this case, the previous reference number should be used when querying
 * GAS until a new submission occurs.
 *
 * In all other scenarios the current reference number is used.
 *
 * @param {string} previousStatus - The last known Grants UI application status.
 * @param {FormContext} context - The request context containing reference information.
 *
 * @returns {string} The client reference number that should be used when calling GAS.
 */

export function resolveClientReference(previousStatus, context) {
  if (previousStatus === ApplicationStatus.REOPENED && context.state?.previousReferenceNumber) {
    return /** @type {string} */ (context.state.previousReferenceNumber)
  }

  return context.referenceNumber
}

/**
 * @typedef {object} StateGuard
 * @property {string} stateKey - Dot-delimited path into form state that must be present.
 * @property {string[]} [allowedPaths] - Paths exempt from the guard when the state key is missing.
 * @property {string[]} [paths] - Paths where the guard applies. If omitted, the guard applies to every path.
 * @property {unknown} [expectedValue] - Exact state value required when the key is present.
 * @property {string} redirectTo - Path to redirect to when the required state is missing.
 * @property {'redirect' | 'forbidden'} [failure] - Failure response type. Defaults to redirect.
 * @property {string} [message] - Error message for forbidden failures.
 */

/**
 * @typedef {object} StateGuardOptions
 * @property {boolean} [pathScopedOnly] - When true, skip guards without explicit paths.
 */

/**
 * @typedef {object} GrantRedirectRules
 * @property {string[]} [excludedPaths] - Paths excluded from redirect handling.
 * @property {RedirectRule[]} [preSubmission] - Redirect rules applied before submission.
 * @property {RedirectRule[]} [postSubmission] - Redirect rules applied after submission.
 * @property {StateGuard[]} [stateGuards] - State guard rules enforced before redirects.
 */

/**
 * @typedef {object} FormsStatusRedirectContext
 * @property {string} grantId - The grant slug identifying the grant type.
 * @property {string} grantCode - The grant code used in GAS lookups.
 * @property {string | undefined} previousStatus - The previous application status stored in state.
 * @property {GrantRedirectRules | undefined} grantRedirectRules - Redirect rules from the form metadata.
 */

/**
 * @import { AnyRequest, AnyFormRequest, FormContext, FormSubmissionState } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseToolkit } from '@hapi/hapi'
 */
