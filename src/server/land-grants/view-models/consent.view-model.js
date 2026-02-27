/**
 * Maps consent data to view models for rendering on the consent-required page.
 */

const SSSI_CONSENT_LINK =
  './fptt-information#sec-10-get-all-necessary-regulatory-consents-permissions-and-licences-in-place'
const HEFER_LINK = './fptt-information#section-5.5'

/**
 * Returns the consent panel view model for the consent-required page.
 * @param {string[]} requiredConsents
 * @param {number} actionCount - Total number of actions in the application
 * @returns {{ consentType: string, titleText: string, sssiConsentLink?: string, heferLink?: string } | null}
 */
export function mapConsentPanelToViewModel(requiredConsents, actionCount) {
  const hasSssi = requiredConsents.includes('sssi')
  const hasHefer = requiredConsents.includes('hefer')

  if (hasSssi && hasHefer) {
    return {
      consentType: 'all',
      titleText:
        actionCount === 1 ? 'You must get consent to do your action' : 'You must get consent to do your actions',
      sssiConsentLink: SSSI_CONSENT_LINK,
      heferLink: HEFER_LINK
    }
  }

  if (hasHefer) {
    return {
      consentType: 'hefer',
      titleText: 'You must get an SFI Historic Environment Farm Environment Record (SFI HEFER) from Historic England',
      heferLink: HEFER_LINK
    }
  }

  if (hasSssi) {
    return {
      consentType: 'sssi',
      titleText: 'You must have SSSI consent',
      sssiConsentLink: SSSI_CONSENT_LINK
    }
  }

  return null
}
