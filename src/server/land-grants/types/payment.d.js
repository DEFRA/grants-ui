/**
 * @typedef {Object} ParcelItem
 * @property {string} code - Action code
 * @property {string} description - Action description
 * @property {number} version - Version number
 * @property {string} unit - Unit of measurement
 * @property {number} quantity - Quantity
 * @property {number} rateInPence - Rate in pence
 * @property {number} annualPaymentPence - Annual payment in pence
 * @property {string} sheetId - Sheet identifier
 * @property {string} parcelId - Parcel identifier
 */

/**
 * @typedef {object} PaymentLineItem
 * @property {number} [parcelItemId] - ID of the linked PaymentParcelItem
 * @property {number} [agreementLevelItemId] - ID of the linked AgreementLevelItem
 * @property {number} paymentPence - The payment for the parcel item
 */

/**
 * @typedef {object} ScheduledPayment
 * @property {Array<PaymentLineItem>} lineItems - Array of line items for the payment
 * @property {string} paymentDate - The payment date
 * @property {number} totalPaymentPence - The annual payment paid for the action
 */

/**
 * @typedef {object} PaymentCalculation
 * @property {string} agreementStartDate - Agreement start date in ISO format (YYYY-MM-DD)
 * @property {string} agreementEndDate - Agreement end date in ISO format (YYYY-MM-DD)
 * @property {string} frequency - Payment frequency (e.g., "Quarterly", "Annual")
 * @property {number} agreementTotalPence - Total payment amount for entire agreement in pence
 * @property {number} annualTotalPence - Annual payment total in pence
 * @property {object} parcelItems - Parcel-level payment items keyed by ID
 * @property {object} agreementLevelItems - Agreement-level payment items keyed by ID
 * @property {Array<ScheduledPayment>} payments - Scheduled payment breakdown
 */

/**
 * @typedef {object} PaymentCalculationResponse
 * @property {PaymentCalculation} payment - The payment calculation details
 * @property {string} message - Indicates if the calculation was successful
 */
