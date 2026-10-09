import { ApplicationStatus } from '../common/constants/application-status.js'
import { isApplicationWindowOpen } from '../common/helpers/application-window.js'

/** @param {any} request @param {any} definition @param {any[]} applications */
export function buildApplicationsViewModel(request, definition, applications) {
  const schemeName = definition.metadata?.shortName ?? definition.name
  return {
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
      let statusText = 'Draft'
      let statusClasses = 'govuk-tag--red'
      if (submitted) {
        statusText = 'Submitted'
        statusClasses = 'govuk-tag--green'
      } else if (application.applicationStatus === ApplicationStatus.REOPENED) {
        statusText = 'Returned for amendments'
        statusClasses = 'govuk-tag--yellow'
      }
      let actionText = 'Continue application'
      if (isClaim) {
        actionText = 'View claim'
      } else if (submitted) {
        actionText = 'View application'
      }
      return {
        ...application,
        referenceNumber: application.applicationRef,
        statusText,
        statusClasses,
        actionText,
        href: `/${request.params.slug}${application.applicationStatus === ApplicationStatus.SUBMITTED ? '/print-submitted-application' : ''}?ref=${encodeURIComponent(application.applicationRef)}`
      }
    })
  }
}
