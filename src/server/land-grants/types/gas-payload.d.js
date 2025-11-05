/**
 * @typedef {Object} Metadata
 * @property {string} sbi - Single Business Identifier
 * @property {string} frn - Firm Reference Number
 * @property {string} crn - Customer Reference Number
 * @property {string} defraId - DEFRA Identifier
 * @property {string} clientRef - Client Reference
 * @property {string} submittedAt - ISO 8601 timestamp of submission
 */

/**
 * @typedef {Object} UnitQuantity
 * @property {string} [unit] - Unit of measurement (e.g., "ha")
 * @property {number} [quantity] - Quantity value
 */

/**
 * @typedef {Object} PaymentRates
 * @property {number} [ratePerUnitPence] - Rate per unit in pence
 * @property {number} [agreementLevelAmountPence] - Agreement level amount in pence
 */

/**
 * @typedef {Object} Action
 * @property {string} code - Action code (e.g., "CMOR1", "UPL1")
 * @property {string} [description] - Action description
 * @property {number} [durationYears] - Duration in years
 * @property {UnitQuantity} [eligible] - Eligible quantity details
 * @property {UnitQuantity} [appliedFor] - Applied for quantity details
 * @property {PaymentRates} [paymentRates] - Payment rate information
 * @property {number} [annualPaymentPence] - Annual payment in pence
 */

/**
 * @typedef {Object} Parcel
 * @property {string} sheetId - Sheet identifier
 * @property {string} parcelId - Parcel identifier
 * @property {UnitQuantity} area - Parcel area details
 * @property {Action[]} actions - Array of actions for this parcel
 */

/**
 * @typedef {Object} Application
 * @property {string} scheme - Scheme name (e.g., "SFI")
 * @property {number} [totalAnnualPaymentPence] - Total annual payment in pence
 * @property {Parcel[]} parcels - Array of parcels with actions
 * @property {string} [applicationValidationRunId] - Application validation run ID (optional)
 * @property {Applicant} applicant - Applicant details
 */

/**
 * @typedef {Object} SFIApplication
 * @property {Metadata} metadata - Application metadata
 * @property {Application} answers - Application answers and details
 */

/**
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { Applicant } from '~/src/server/land-grants/types/applicant.d.js'
 */
