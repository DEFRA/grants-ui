/**
 * @typedef Action
 * @property {string} code
 * @property {number} quantity
 */

/**
 * @typedef LandActions
 * @property {string} sheetId
 * @property {string} parcelId
 * @property {Action[]} actions
 */

/**
 * @typedef {object} LineItem
 * @property {number} parcelItemId - ID of the linked PaymentParcelItem
 * @property {number} paymentPence - The payment for the parcel item
 */

/**
 * @typedef {object} ScheduledPayment
 * @property {Array<LineItem>} lineItems - Array of line items for the payment
 * @property {string} paymentDate - The payment date
 * @property {number} totalPaymentPence - The annual payment paid for the action
 */

/**
 * @typedef {object} PaymentCalculationResponse
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
 * @typedef {object} Size
 * @property {number} value
 * @property {string} unit - The unit of measurement (e.g., "ha")
 */

/**
 * @typedef {object} ActionOption
 * @property {string} code - The action code
 * @property {string} description - The action description
 * @property {Size} availableArea - The available area for the action
 * @property {number} ratePerUnitGbp - The rate per unit in GBP
 * @property {number} ratePerAgreementPerYearGbp - The rate per agreement per year in GBP
 */

/**
 * @typedef {object} Parcel
 * @property {string} parcelId - The parcel identifier
 * @property {string} sheetId - The sheet identifier
 * @property {Size?} size - The size of the parcel
 * @property {ActionOption[]?} actions - Array of actions available for the parcel
 */

/**
 * @typedef {object} ValidateApplicationRequest
 * @property {string} applicationId
 * @property {string} requester
 * @property {string} applicantCrn
 * @property {LandActions[]} landActions
 */
