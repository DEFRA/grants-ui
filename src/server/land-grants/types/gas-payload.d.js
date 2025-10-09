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
 * @typedef {Object} AppliedFor
 * @property {string} [unit] - Unit of measurement (e.g., "ha")
 * @property {number} [quantity] - Quantity applied for
 */

/**
 * @typedef {Object} ActionApplication
 * @property {string} code - Action code (e.g., "CMOR1", "UPL1")
 * @property {string} sheetId - Sheet identifier
 * @property {string} parcelId - Parcel identifier
 * @property {AppliedFor} [appliedFor] - Applied quantity details
 */

/**
 * @typedef {Object} Answers
 * @property {boolean} hasCheckedLandIsUpToDate - Land check confirmation
 * @property {string} [agreementName] - Agreement name (optional)
 * @property {string} scheme - Scheme name (e.g., "SFI")
 * @property {number} year - Application year
 * @property {ActionApplication[]} actionApplications - Array of action applications
 * @property {string} [applicationValidationRunId] - Application validation run ID (optional)
 * @property {PaymentCalculation} [payment] - Payment details (optional)
 * @property {Applicant} [applicant] - Applicant details (optional)
 */

/**
 * @typedef {Object} SFIApplication
 * @property {Metadata} metadata - Application metadata
 * @property {Answers} answers - Application answers and details
 */

/**
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { Applicant } from '~/src/server/land-grants/types/applicant.d.js'
 */
