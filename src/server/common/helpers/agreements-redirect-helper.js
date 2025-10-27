/**
 * Determines if a request should redirect to the agreements service
 * based on the grant slug and GAS status
 *
 * @param {string} slug - The grant slug/ID (e.g., 'farm-payments')
 * @param {string} gasStatus - The status from GAS API (e.g., 'OFFER_SENT')
 * @returns {boolean} True if should redirect to agreements service
 */
export function shouldRedirectToAgreements(slug, gasStatus) {
  const offerStatuses = ['OFFER_SENT', 'OFFER_WITHDRAWN', 'OFFER_ACCEPTED']
  return slug === 'farm-payments' && offerStatuses.includes(gasStatus)
}
