import { ApplicationStatus } from '../common/constants/application-status.js'
import { generateUniqueReference } from '@defra/forms-engine-plugin/engine/referenceNumbers.js'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../common/helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../common/helpers/grant-code.js'
import { listApplicationsFromApi } from '../common/helpers/state/fetch-saved-state-helper.js'
import { setReferenceNumber } from '../common/helpers/state/get-cache-key-helper.js'
import { getStateWithDefinition, resolveVersion } from '../common/helpers/state/state-with-definition-context.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { isApplicationWindowOpen } from '../common/helpers/application-window.js'
import { PermissionError } from '../common/utils/errors/PermissionError.js'

/** @param {any} request */
async function loadDefinition(request) {
  const envelope = await getStateWithDefinition(request)
  setReferenceNumber(request)
  request.app.stateWithDefinition = Promise.resolve(envelope)
  const definition = envelope?.definition?.definition
  if (definition?.metadata?.allowMultipleApplications !== true) {
    throw new PermissionError({
      message: 'Page not found',
      source: 'applicationsRoute',
      reason: 'Multiple applications disabled',
      status: 404
    })
  }
  request.app.model = { def: definition }
  request.app.grantVersion = resolveVersion(envelope)
  return definition
}

/** @satisfies {ServerRoute} */
export const listApplicationsRoute = {
  method: 'GET',
  path: '/{slug}/applications',
  handler: async (/** @type {any} */ request, h) => {
    const definition = await loadDefinition(request)
    const crn = getAuthenticatedCrn(request)
    const sbi = getAuthenticatedSbi(request)
    const grantCode = getGrantCode(request)
    const applications = await listApplicationsFromApi({ crn, sbi, grantCode })
    const schemeName = definition.metadata?.shortName ?? definition.name
    return h.view('applications', {
      pageTitle: `Your ${schemeName} applications`,
      schemeName,
      serviceName: schemeName,
      serviceUrl: `/${request.params.slug}`,
      supportEmail: definition.metadata?.supportEmail ?? 'ruralpayments@defra.gov.uk',
      slug: request.params.slug,
      canStartApplication: isApplicationWindowOpen(request),
      applications: applications.map((application) => {
        const isClaim =
          application.applicationStatus === ApplicationStatus.CLAIM_STARTED ||
          application.applicationStatus === ApplicationStatus.CLAIM_SUBMITTED
        const submitted = isClaim || application.applicationStatus === ApplicationStatus.SUBMITTED
        return {
          ...application,
          referenceNumber: application.applicationRef,
          statusText: submitted
            ? 'Submitted'
            : application.applicationStatus === ApplicationStatus.REOPENED
              ? 'Returned for amendments'
              : 'Draft',
          statusClasses: submitted
            ? 'govuk-tag--green'
            : application.applicationStatus === ApplicationStatus.REOPENED
              ? 'govuk-tag--yellow'
              : 'govuk-tag--red',
          actionText: isClaim ? 'View claim' : submitted ? 'View application' : 'Continue application',
          href: `/${request.params.slug}${application.applicationStatus === ApplicationStatus.SUBMITTED ? '/print-submitted-application' : ''}?ref=${encodeURIComponent(application.applicationRef)}`
        }
      })
    })
  }
}

/** @satisfies {ServerRoute} */
export const startApplicationRoute = {
  method: 'POST',
  path: '/{slug}/applications',
  handler: async (/** @type {any} */ request, h) => {
    const definition = await loadDefinition(request)
    if (!isApplicationWindowOpen(request)) {
      return h.redirect(`/${request.params.slug}/application-window-closed`).code(303)
    }
    const reference = generateUniqueReference(/** @type {string} */ (definition.metadata?.referenceNumberPrefix ?? ''))
    await getFormsCacheService(request.server).setState(request, { $$__referenceNumber: reference })
    setReferenceNumber(request, reference)
    for (const key of ['visitedSubSections', 'statusChangeRedirect', 'grantApplicationContext']) {
      request.yar.clear(key)
    }
    delete request.app.stateWithDefinition
    return h
      .redirect(
        `/${request.params.slug}${definition.startPage ?? definition.pages[0].path}?ref=${encodeURIComponent(reference)}`
      )
      .code(303)
  }
}

/** @import { ServerRoute } from '@hapi/hapi' */
