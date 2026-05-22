/**
 * @typedef {object} PrintParcelItem
 * @property {string} sheetId
 * @property {string} parcelId
 * @property {string} description
 * @property {string} code
 * @property {number} quantity
 * @property {number} annualPaymentPence
 */

/**
 * @typedef {object} PrintAgreementItem
 * @property {string} description
 * @property {string} code
 * @property {number} annualPaymentPence
 */

/**
 * @typedef {object} PrintPayment
 * @property {Record<string, PrintParcelItem>} [parcelItems]
 * @property {Record<string, PrintAgreementItem>} [agreementLevelItems]
 * @property {number} annualTotalPence
 */

/**
 * @typedef {{ text: string | number, format?: string }} PrintTableCell
 * @typedef {{ cardTitle: string, items: PrintTableCell[][] }} PrintParcelCard
 */
