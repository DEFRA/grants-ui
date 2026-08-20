/**
 * Maps consent data to view models for rendering on the consent-required page.
 */

const SSSI_CONSENT_LINK =
  './fptt-information#sec-10-get-all-necessary-regulatory-consents-permissions-and-licences-in-place'
const HEFER_LINK = './fptt-information#section-5.5'

/**
 * Returns the consent panel view model for the consent-required page.
 * @param {string[]} requiredConsents
 * @returns {{ consentType: string, sssiConsentLink?: string, heferLink?: string } | null}
 */
export function mapConsentPanelToViewModel(requiredConsents) {
  const hasSssi = requiredConsents.includes('sssi')
  const hasHefer = requiredConsents.includes('hefer')

  if (hasSssi && hasHefer) {
    return {
      consentType: 'all',
      sssiConsentLink: SSSI_CONSENT_LINK,
      heferLink: HEFER_LINK
    }
  }

  if (hasHefer) {
    return {
      consentType: 'hefer',
      heferLink: HEFER_LINK
    }
  }

  if (hasSssi) {
    return {
      consentType: 'sssi',
      sssiConsentLink: SSSI_CONSENT_LINK
    }
  }

  return null
}

/**
 * The consent labels a set of keys resolves to, in canonical SSSI-then-HEFER
 * order however they arrive. Unknown keys, an empty set, and persisted state
 * predating the consents field all yield nothing.
 * @param {string[] | undefined} requiredConsents
 * @returns {string[]}
 */
function consentLabels(requiredConsents, sssiLabel, heferLabel) {
  const consents = Array.isArray(requiredConsents) ? requiredConsents : []
  const labels = []
  if (consents.includes('sssi')) {
    labels.push(sssiLabel)
  }
  if (consents.includes('hefer')) {
    labels.push(heferLabel)
  }
  return labels
}

/**
 * The "Requires ..." hint shown beneath a selected action's name.
 * @param {string[] | undefined} requiredConsents
 * @returns {string}
 */
export function getConsentRequirementText(requiredConsents) {
  const labels = consentLabels(requiredConsents, 'SSSI consent', 'an SFI HEFER')
  return labels.length ? `Requires ${labels.join(' and ')}` : ''
}

/**
 * The notice shown on the map's selected-parcel summary. Rendered here rather
 * than in the browser so every consent string lives in one module.
 * @param {string[] | undefined} requiredConsents
 * @returns {string}
 */
export function getConsentNoticeText(requiredConsents) {
  const labels = consentLabels(requiredConsents, 'SSSI consent', 'an SFI HEFER')
  if (!labels.length) {
    return ''
  }
  // "an SFI HEFER" leads the sentence when it is the only requirement.
  const sentence = `${labels.join(' and ')} may apply to some actions`
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}
