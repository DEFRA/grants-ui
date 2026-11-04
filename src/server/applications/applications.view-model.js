import { TagClasses } from '../common/constants/tag-classes.js'
import { ApplicationStatus } from '../common/constants/application-status.js'
import { isApplicationWindowOpen } from '../common/helpers/application-window.js'
import { findRedirectRule } from '../common/request-pipeline/redirects/redirect-rules.js'
import agreements from '~/src/config/agreements.js'

/**
 * Row link. Only an application GAS confirms is still simply submitted opens as its print view (a page the
 * grant excludes from the status redirect); every other row goes to the grant root and the status redirect decides.
 * @param {string} slug @param {string} applicationRef @param {boolean} viewsPrintPage
 */
function applicationHref(slug, applicationRef, viewsPrintPage) {
  return `/${slug}${viewsPrintPage ? '/print-submitted-application' : ''}?ref=${encodeURIComponent(applicationRef)}`
}

/**
 * @param {any} request
 * @param {any} definition
 * @param {any[]} applications
 * @param {{ gasStatuses?: Map<string, string>, postSubmissionRules?: any[] }} [gas] - GAS status by reference and the
 *   grant's post-submission rules, so a submitted application GAS has returned for amendments shows as returned
 */
export function buildApplicationsViewModel(
  request,
  definition,
  applications,
  { gasStatuses = new Map(), postSubmissionRules = [] } = {}
) {
  const schemeName = definition.metadata?.shortName ?? definition.name
  return {
    pageTitle: `Your ${schemeName} applications`,
    schemeName,
    serviceName: schemeName,
    serviceUrl: `/${request.params.slug}`,
    supportEmail: definition.metadata?.supportEmail ?? 'ruralpayments@defra.gov.uk',
    slug: request.params.slug,
    canStartApplication: isApplicationWindowOpen(request, definition),
    applications: applications
      .filter(
        (application) => typeof application.applicationRef === 'string' && application.applicationRef.trim().length > 0
      )
      .map((application) => {
        const isClaim =
          application.applicationStatus === ApplicationStatus.CLAIM_STARTED ||
          application.applicationStatus === ApplicationStatus.CLAIM_SUBMITTED
        const gasRule = matchedGasRule(application, gasStatuses, postSubmissionRules)
        const returned =
          application.applicationStatus === ApplicationStatus.REOPENED ||
          gasRule?.toGrantsStatus === ApplicationStatus.REOPENED
        const submitted = isClaim || (application.applicationStatus === ApplicationStatus.SUBMITTED && !returned)
        // GAS keeps it SUBMITTED inside the journey: not returned, not withdrawn, not with the agreements service.
        const confirmedSubmitted =
          gasRule?.toGrantsStatus === ApplicationStatus.SUBMITTED && gasRule.toPath !== agreements.get('baseUrl')
        let statusText
        let statusClasses
        if (submitted) {
          statusText = 'Submitted'
          statusClasses = TagClasses.GREEN
        } else if (returned) {
          statusText = 'Returned for amendments'
          statusClasses = TagClasses.YELLOW
        } else {
          statusText = 'Draft'
          statusClasses = TagClasses.BLUE
        }
        let actionText
        if (isClaim) {
          actionText = 'View claim'
        } else if (submitted) {
          actionText = 'View application'
        } else {
          actionText = 'Continue application'
        }
        return {
          ...application,
          referenceNumber: application.applicationRef,
          submittedAt: submitted ? application.submittedAt : null,
          statusText,
          statusClasses,
          actionText,
          href: applicationHref(request.params.slug, application.applicationRef, confirmedSubmitted)
        }
      })
  }
}

/**
 * The post-submission rule a submitted application's GAS status matches under the grant's rules;
 * undefined when the application is not submitted or GAS could not be read.
 * @param {any} application @param {Map<string, string>} gasStatuses @param {any[]} postSubmissionRules
 * @returns {{ toGrantsStatus: string, toPath: string } | undefined}
 */
function matchedGasRule(application, gasStatuses, postSubmissionRules) {
  if (application.applicationStatus !== ApplicationStatus.SUBMITTED) {
    return undefined
  }
  const gasStatus = gasStatuses.get(application.applicationRef)
  return gasStatus === undefined
    ? undefined
    : findRedirectRule(ApplicationStatus.SUBMITTED, gasStatus, postSubmissionRules)
}
