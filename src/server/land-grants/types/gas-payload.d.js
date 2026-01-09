/**
 * @typedef {Object} Metadata
 * @property {string} sbi - Single Business Identifier
 * @property {string} frn - Firm Reference Number
 * @property {string} crn - Customer Reference Number
 * @property {string} clientRef - Client Reference
 * @property {string} submittedAt - ISO 8601 timestamp of submission
 */

/**
 * @typedef {Object} UnitQuantity
 * @property {string} [unit] - Unit of measurement (e.g., "ha")
 * @property {number} [quantity] - Quantity value
 */

/**
 * @typedef {Object} ApplicationAction
 * @property {string} code - Action code (e.g., "CMOR1", "UPL1")
 * @property {number} version - Action version
 * @property {number} [durationYears] - Duration in years
 * @property {UnitQuantity} [appliedFor] - Applied for quantity details
 */

/**
 * @typedef {Object} PaymentAction
 * @property {string} code - Action code (e.g., "CMOR1", "UPL1")
 * @property {string} [description] - Action description
 * @property {number} [durationYears] - Duration in years
 * @property {UnitQuantity} [eligible] - Eligible quantity details
 * @property {UnitQuantity} [appliedFor] - Applied for quantity details
 * @property {number} [paymentRates] - Payment rate in pence
 * @property {number} [annualPaymentPence] - Annual payment in pence
 */

/**
 * @typedef {Object} ApplicationParcel
 * @property {string} sheetId - Sheet identifier
 * @property {string} parcelId - Parcel identifier
 * @property {UnitQuantity} area - Parcel area details
 * @property {ApplicationAction[]} actions - Array of actions for this parcel
 */

/**
 * @typedef {Object} PaymentParcel
 * @property {string} sheetId - Sheet identifier
 * @property {string} parcelId - Parcel identifier
 * @property {UnitQuantity} area - Parcel area details
 * @property {PaymentAction[]} actions - Array of payment actions for this parcel
 */

/**
 * @typedef {Object} ApplicationAgreement
 * @property {string} code - Agreement action code
 * @property {number} version - Agreement version
 * @property {number} [durationYears] - Duration in years
 */

/**
 * @typedef {Object} PaymentAgreement
 * @property {string} code - Agreement action code
 * @property {string} [description] - Agreement description
 * @property {number} [durationYears] - Duration in years
 * @property {number} [paymentRates] - Payment rate in pence
 * @property {number} [annualPaymentPence] - Annual payment in pence
 */

/**
 * @typedef {Object} ApplicationSection
 * @property {ApplicationParcel[]} parcel - Array of parcels with actions
 * @property {ApplicationAgreement[]} agreement - Array of agreement-level actions
 */

/**
 * @typedef {Object} PaymentsSection
 * @property {PaymentParcel[]} parcel - Array of parcels with payment details
 * @property {PaymentAgreement[]} agreement - Array of agreement-level payment details
 */

/**
 * @typedef {Object} RulesCalculations
 * @property {number} id - Validation id
 * @property {string} message - Validation response message
 * @property {boolean} valid - Validation result
 * @property {string} date - Validation date
 */

/**
 * @typedef {Object} Application
 * @property {RulesCalculations} [rulesCalculations] - Rules calculations object with validation details
 * @property {string} scheme - Scheme name (e.g., "SFI")
 * @property {Applicant} applicant - Applicant details
 * @property {number} [totalAnnualPaymentPence] - Total annual payment in pence
 * @property {ApplicationSection} application - Application parcels and agreements
 * @property {PaymentsSection} payments - Payment details for parcels and agreements
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
