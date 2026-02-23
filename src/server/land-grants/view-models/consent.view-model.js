/**
 * Maps consent data to view models for rendering on the consent-required page.
 */

const SSSI_CONSENT_LINK =
  './fptt-information#sec-10-get-all-necessary-regulatory-consents-permissions-and-licences-in-place'
const HEFER_LINK = './fptt-information#section-5.5'

/**
 * @param {string} href
 * @param {string} text
 * @returns {string}
 */
function panelLink(href, text) {
  return `<a class="govuk-link govuk-link--inverse" href="${href}" rel="noreferrer nofollow" target="_blank">${text} (opens in new tab)</a>`
}

const PANEL_TITLE = 'You must get consent to do your actions'
const SSSI_LINK_HTML = panelLink(SSSI_CONSENT_LINK, 'SSSI consent')
const HEFER_LINK_HTML = panelLink(HEFER_LINK, 'SFI Historic Environment Farm Environment Record (SFI HEFER)')

/**
 * Returns the consent panel view model for the consent-required page.
 * @param {string[]} requiredConsents
 * @returns {{ titleText: string, html: string } | null}
 */
export function mapConsentPanelToViewModel(requiredConsents) {
  const hasSssi = requiredConsents.includes('sssi')
  const hasHefer = requiredConsents.includes('hefer')

  if (hasSssi && hasHefer) {
    return {
      titleText: PANEL_TITLE,
      html: `<p class="govuk-body">You are applying for actions on land that's a site of special scientific interest (SSSI) and land with historic or archaeological features. Before starting your actions, you must get:</p>
             <ul class="govuk-list govuk-list--bullet govuk-!-margin-top-4 govuk-!-margin-bottom-0">
               <li class="govuk-!-margin-top-10">an ${HEFER_LINK_HTML} from Historic England</li>
               <li>${SSSI_LINK_HTML} from Natural England</li>
             </ul>`
    }
  }

  if (hasHefer) {
    return {
      titleText: PANEL_TITLE,
      html: `<p class="govuk-body">You are applying for actions on land with historic or archaeological features. Before starting your actions, you must get an ${HEFER_LINK_HTML} from Historic England.</p>`
    }
  }

  if (hasSssi) {
    return {
      titleText: 'You must have SSSI consent',
      html: `<p class="govuk-body">You are applying for actions on land that's a site of special scientific interest (SSSI). You must get SSSI consent from Natural England.</p>
             <p class="govuk-body">Read the ${panelLink(SSSI_CONSENT_LINK, 'guidance on SSSI consent')}.</p>`
    }
  }

  return null
}
