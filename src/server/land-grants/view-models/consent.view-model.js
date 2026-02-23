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
  return `<a class="govuk-link govuk-link--inverse" href="${href}" rel="noreferrer noopener" target="_blank">${text} (opens in new tab)</a>`
}

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
      titleText: 'You must get consent to do your actions',
      html: `<p class="govuk-body">You are applying for actions on land that's a site of special scientific interest (SSSI) and land with historic or archaeological features. Before starting your actions, you must get:</p>
             <ul class="govuk-list govuk-list--bullet govuk-!-margin-top-4 govuk-!-margin-bottom-0">
               <li class="govuk-!-margin-top-10">an ${panelLink(
                 HEFER_LINK,
                 'SFI Historic Environment Farm Environment Record (SFI HEFER)'
               )} from Historic England</li>
               <li>${panelLink(SSSI_CONSENT_LINK, 'SSSI consent')} from Natural England</li>
             </ul>`
    }
  }

  if (hasHefer) {
    return {
      titleText: 'You must get an SFI Historic Environment Farm Environment Record (SFI HEFER) from Historic England',
      html: `<p class="govuk-body">This is because you are applying for actions on land with historic or archaeological features. You must do this before you do your selected SFI actions on this land.</p><p class="govuk-body">Read the guidance on ${panelLink(HEFER_LINK, 'land with historic or archaeological features')} to find out what a HEFER is and how to request one.</p>`
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
