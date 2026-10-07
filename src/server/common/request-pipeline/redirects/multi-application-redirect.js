import { notFound } from '@hapi/boom'
import { ApplicationStatus } from '../../constants/application-status.js'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../../helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../../helpers/grant-code.js'
import { getApplicationRef, setApplicationRef } from '../../helpers/state/get-cache-key-helper.js'
import { getStateWithDefinition } from '../../helpers/state/state-with-definition-context.js'
import { listApplicationsFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { SLUG_ROOT_ROUTE } from './service-root-redirect.js'

/**
 * `?ref=` routing (onPostAuth, before the plugin loads state). A grant is
 * multi-application when its definition is flagged or the backend already
 * stores the SBI's documents keyed by ref (`allowMultipleApplications` on the doc). With a ref it must resolve (404 otherwise; a
 * single-application grant just drops it). Without one: 0/1 continue, 2+ selector.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @returns {Promise<symbol | import('@hapi/hapi').ResponseObject>}
 */
export async function multiApplicationRedirect(request, h) {
  if (request.path === applicationsSelectorPath(request)) {
    return h.continue
  }

  const ref = getApplicationRef(request)
  const envelope = await getStateWithDefinition(request)

  return ref ? resolveWithRef(request, h, envelope) : resolveWithoutRef(request, h, envelope)
}

/**
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @param {StateWithDefinitionEnvelope | null} envelope
 */
async function resolveWithRef(request, h, envelope) {
  if (envelope?.state) {
    return h.continue
  }

  const isMultiApplication = allowsMultipleApplications(envelope) || (await listApplications(request)).length > 1

  if (isMultiApplication) {
    throw notFound('Unknown application reference')
  }

  // Single-application grant: a stray ref is ignored (POST keeps its payload).
  setApplicationRef(request, undefined)
  return request.method === 'get' ? h.redirect(currentUrl(request)).takeover() : h.continue
}

/**
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @param {StateWithDefinitionEnvelope | null} envelope - the backend's unscoped pick
 */
async function resolveWithoutRef(request, h, envelope) {
  const isRootRequest = request.route?.path === SLUG_ROOT_ROUTE
  const isMultiApplication = allowsMultipleApplications(envelope) || envelope?.state?.allowMultipleApplications === true

  if (!isMultiApplication && !isRootRequest) {
    return h.continue
  }

  const applications = await listApplications(request)

  if (applications.length > 1) {
    return h.redirect(applicationsSelectorPath(request)).takeover()
  }

  if (applications.length === 1 && isShadowedByPurgedApplication(envelope, applications[0])) {
    return scopeToApplication(request, h, applications[0].applicationRef)
  }

  // 0 or 1 application: no ref needed, as before.
  return h.continue
}

/**
 * The applications list hides PURGED documents but the unscoped state read
 * does not, so with one live and one purged application the read can land on
 * the purged one.
 *
 * @param {StateWithDefinitionEnvelope | null} envelope
 * @param {{ applicationRef: string }} live
 * @returns {boolean}
 */
function isShadowedByPurgedApplication(envelope, live) {
  const picked = envelope?.state

  return (
    picked?.state?.applicationStatus === ApplicationStatus.PURGED &&
    Boolean(live.applicationRef) &&
    picked.applicationRef !== live.applicationRef
  )
}

/**
 * @param {AnyRequest} request
 * @param {ResponseToolkit} h
 * @param {string} applicationRef
 */
function scopeToApplication(request, h, applicationRef) {
  if (request.method === 'get') {
    setApplicationRef(request, undefined)
    return h.redirect(currentUrl(request, applicationRef)).takeover()
  }

  setApplicationRef(request, applicationRef)
  return h.continue
}

/**
 * @param {AnyRequest} request
 * @returns {string}
 */
function applicationsSelectorPath(request) {
  return `/${request.params.slug}/applications`
}

/**
 * @param {StateWithDefinitionEnvelope | null | undefined} envelope
 * @returns {boolean}
 */
function allowsMultipleApplications(envelope) {
  const definition = envelope?.definition

  return (
    definition?.allowMultipleApplications === true ||
    definition?.definition?.metadata?.allowMultipleApplications === true
  )
}

/**
 * @param {AnyRequest} request
 */
function listApplications(request) {
  return listApplicationsFromApi({
    crn: getAuthenticatedCrn(request),
    sbi: getAuthenticatedSbi(request),
    grantCode: getGrantCode(request)
  })
}

/**
 * The request's own URL, with the ref replaced (or removed).
 *
 * @param {AnyRequest} request
 * @param {string} [ref]
 * @returns {string}
 */
function currentUrl(request, ref) {
  const params = new URLSearchParams(request.url.search)
  params.delete('ref')

  if (ref) {
    params.set('ref', ref)
  }

  const query = params.toString()

  return query ? `${request.path}?${query}` : request.path
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseToolkit } from '@hapi/hapi'
 * @import { StateWithDefinitionEnvelope } from '../../helpers/state/fetch-saved-state-helper.js'
 */
