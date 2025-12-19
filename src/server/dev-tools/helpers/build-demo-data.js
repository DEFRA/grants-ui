import { config } from '~/src/config/config.js'

/**
 * Build demo data from configuration
 * Returns demo data values for use in development tools (confirmation page)
 * @returns {object} Demo data object
 */
export function buildDemoData() {
  return {
    referenceNumber: config.get('devTools.demoData.referenceNumber'),
    businessName: config.get('devTools.demoData.businessName'),
    sbi: config.get('devTools.demoData.sbi'),
    contactName: config.get('devTools.demoData.contactName')
  }
}

/**
 * Build demo mapped data from configuration
 * Returns mapped API response data for details page preview
 * @returns {object} Demo mapped data object
 */
export function buildDemoMappedData() {
  return config.get('devTools.mappedData')
}

/**
 * Build demo request object with credentials
 * Returns a mock request object for details page preview
 * @returns {object} Mock request object with auth credentials
 */
export function buildDemoRequest() {
  return {
    auth: {
      credentials: {
        sbi: config.get('devTools.demoData.sbi'),
        crn: config.get('devTools.demoData.crn')
      }
    }
  }
}
