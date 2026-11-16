import { TagClasses } from '../common/constants/tag-classes.js'
import { ApplicationStatus } from '../common/constants/application-status.js'
import { isApplicationWindowOpen } from '../common/helpers/application-window.js'
import { findRedirectRule } from '../common/request-pipeline/redirects/forms-status-redirect.js'
import agreements from '~/src/config/agreements.js'
import { buildFeedbackSurveyUrl } from '../common/helpers/feedback-survey.js'

const SUBMITTED_ROW = {
  statusText: 'Submitted',
  statusClasses: TagClasses.GREEN,
  actionText: 'View application',
  showsSubmittedAt: true
}
const CLAIM_ROW = { ...SUBMITTED_ROW, actionText: 'View claim' }
const RETURNED_ROW = {
  statusText: 'Returned for amendments',
  statusClasses: TagClasses.YELLOW,
  actionText: 'Continue application',
  showsSubmittedAt: false
}
const DRAFT_ROW = { ...RETURNED_ROW, statusText: 'Draft', statusClasses: TagClasses.BLUE }

/** How a row reads for each application status; any other status is a draft. */
const ROW_BY_STATUS = {
  [ApplicationStatus.SUBMITTED]: SUBMITTED_ROW,
  [ApplicationStatus.CLAIM_STARTED]: CLAIM_ROW,
  [ApplicationStatus.CLAIM_SUBMITTED]: CLAIM_ROW,
  [ApplicationStatus.REOPENED]: RETURNED_ROW
}

/**
 * @param {any} request
 * @param {any} definition
 * @param {any[]} applications
 * @param {{ gasStatuses?: Map<string, string>, postSubmissionRules?: Map<string, ApplicationRules> }} [gas] - GAS
 *   status and the post-submission rules each application answers to, both by reference, so a submitted application
 *   GAS has returned for amendments shows as returned
 */
export function buildApplicationsViewModel(
  request,
  definition,
  applications,
  { gasStatuses = new Map(), postSubmissionRules = new Map() } = {}
) {
  const schemeName = definition.metadata?.shortName ?? definition.name
  return {
    pageTitle: `Your ${schemeName} applications`,
    schemeName,
    serviceName: schemeName,
    serviceUrl: `/${request.params.slug}`,
    supportEmail: definition.metadata?.supportEmail ?? 'ruralpayments@defra.gov.uk',
    feedbackSurveyUrl: buildFeedbackSurveyUrl(request, definition.metadata),
    slug: request.params.slug,
    canStartApplication: isApplicationWindowOpen(request, definition),
    applications: applications
      .filter(
        (application) => typeof application.applicationRef === 'string' && application.applicationRef.trim().length > 0
      )
      .map((application) => {
        const { rules, ownMajor = false } = postSubmissionRules.get(application.applicationRef) ?? {}
        const gasRule = matchedGasPostSubmissionRule(application, gasStatuses, rules)
        // GAS has the last word on a submitted application: returned for amendments shows as returned.
        const status =
          gasRule?.toGrantsStatus === ApplicationStatus.REOPENED
            ? ApplicationStatus.REOPENED
            : application.applicationStatus
        const row = ROW_BY_STATUS[status] ?? DRAFT_ROW
        return {
          ...application,
          referenceNumber: application.applicationRef,
          submittedAt: row.showsSubmittedAt ? application.submittedAt : null,
          statusText: row.statusText,
          statusClasses: row.statusClasses,
          actionText: row.actionText,
          href: applicationHref(
            request.params.slug,
            application.applicationRef,
            ownMajor && staysSubmittedInJourney(gasRule)
          )
        }
      })
  }
}

/**
 * Row link. Only an application GAS confirms is still simply submitted, under its own major's rules, opens as its
 * print view (a page the grant excludes from the status redirect); every other row goes to the grant root and the
 * status redirect decides.
 * @param {string} slug @param {string} applicationRef @param {boolean} viewsPrintPage
 */
function applicationHref(slug, applicationRef, viewsPrintPage) {
  return `/${slug}${viewsPrintPage ? '/print-submitted-application' : ''}?ref=${encodeURIComponent(applicationRef)}`
}

/**
 * Whether the matched rule keeps a submitted application SUBMITTED inside the journey:
 * not returned, not withdrawn, not handed to the agreements service.
 * @param {{ toGrantsStatus: string, toPath: string } | undefined} rule
 */
function staysSubmittedInJourney(rule) {
  return rule?.toGrantsStatus === ApplicationStatus.SUBMITTED && rule.toPath !== agreements.get('baseUrl')
}

/**
 * The post-submission rule a submitted application's GAS status matches under the given rules;
 * undefined when the application is not submitted or GAS could not be read.
 * @param {any} application @param {Map<string, string>} gasStatuses @param {RedirectRule[] | undefined} rules
 * @returns {RedirectRule | undefined}
 */
function matchedGasPostSubmissionRule(application, gasStatuses, rules) {
  if (application.applicationStatus !== ApplicationStatus.SUBMITTED) {
    return undefined
  }
  const gasStatus = gasStatuses.get(application.applicationRef)
  return gasStatus === undefined ? undefined : findRedirectRule(ApplicationStatus.SUBMITTED, gasStatus, rules)
}

/**
 * @import { RedirectRule } from '../common/request-pipeline/redirects/forms-status-redirect.js'
 * @import { ApplicationRules } from './services/post-submission-rules.service.js'
 */
