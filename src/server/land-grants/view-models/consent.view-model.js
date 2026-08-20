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
 * The short "Requires ..." requirement label for a set of consent keys, used
 * as a hint beneath an action's name. Membership-driven, so the canonical
 * SSSI-then-HEFER order holds whatever order the keys arrive in; unknown keys
 * and an empty set produce an empty string. Persisted state predating the
 * consents field - or carrying a malformed value - yields no label either.
 * @param {string[] | undefined} requiredConsents
 * @returns {string}
 */
export function getConsentRequirementText(requiredConsents) {
  const consents = Array.isArray(requiredConsents) ? requiredConsents : []
  const labels = []
  if (consents.includes('sssi')) {
    labels.push('SSSI consent')
  }
  if (consents.includes('hefer')) {
    labels.push('an SFI HEFER')
  }
  return labels.length ? `Requires ${labels.join(' and ')}` : ''
}
