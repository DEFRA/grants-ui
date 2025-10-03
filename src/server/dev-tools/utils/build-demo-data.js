import { config } from '~/src/config/config.js'

/**
 * Build demo data from configuration
 * Returns demo data values for use in development tools
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
