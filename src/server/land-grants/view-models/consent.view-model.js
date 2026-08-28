/**
 * Maps consent data to view models for rendering on the consent-required page.
 */

const SSSI_CONSENT_LINK =
  './fptt-information#sec-10-get-all-necessary-regulatory-consents-permissions-and-licences-in-place'
const HEFER_LINK = './fptt-information#section-5.5'
const SSSI_REQUIREMENT = 'site of special scientific interest (SSSI) consent'
const HEFER_REQUIREMENT = 'a Historic Environment Farm Environment Record (HEFER)'

/**
 * Returns the consent panel view model for the consent-required page.
 * @param {string[]} requiredConsents
 * @returns {{ consentType: string, sssiConsentLink?: string, heferLink?: string } | null}
 */
export function mapConsentPanelToViewModel(requiredConsents) {
  const hasSSSI = requiredConsents.includes('sssi')
  const hasHefer = requiredConsents.includes('hefer')

  if (hasSSSI && hasHefer) {
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

  if (hasSSSI) {
    return {
      consentType: 'sssi',
      sssiConsentLink: SSSI_CONSENT_LINK
    }
  }

  return null
}

/**
 * The labels for a set of consent keys, always SSSI first then HEFER whatever
 * order they arrive in. Unknown keys, and a consents array that is empty or
 * absent from older persisted state, produce an empty list.
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
 * The requirements notice shown on the map's selected-parcel summary: an
 * intro line plus one bullet per requirement. Built here rather than in the
 * browser so every consent string lives in one module. An empty items array
 * means nothing applies and the row stays hidden.
 * @param {string[] | undefined} requiredConsents
 * @returns {{ intro: string, items: string[] }}
 */
export function getConsentNotice(requiredConsents) {
  const items = consentLabels(requiredConsents, SSSI_REQUIREMENT, HEFER_REQUIREMENT)
  return { intro: items.length ? 'Some actions require:' : '', items }
}
