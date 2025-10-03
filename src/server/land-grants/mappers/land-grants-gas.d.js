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
 * @typedef {Object} EmailAddress
 * @property {string} address - Email address
 */

/**
 * @typedef {Object} PhoneNumber
 * @property {string} mobile - Mobile phone number
 */

/**
 * @typedef {Object} Address
 * @property {string} line1 - Address line 1
 * @property {string} [line2] - Address line 2
 * @property {string} [line3] - Address line 3
 * @property {string} [line4] - Address line 4
 * @property {string} [line5] - Address line 5
 * @property {string} street - Street name
 * @property {string} city - City
 * @property {string} postalCode - Postal code
 */

/**
 * @typedef {Object} Business
 * @property {string} name - Business name
 * @property {EmailAddress} email - Email details
 * @property {PhoneNumber} phone - Phone details
 * @property {Address} address - Business address
 */

/**
 * @typedef {Object} CustomerName
 * @property {string} title - Title (e.g., "Mr", "Mrs")
 * @property {string} first - First name
 * @property {string} middle - Middle name
 * @property {string} last - Last name
 */

/**
 * @typedef {Object} Customer
 * @property {CustomerName} name - Customer name details
 */

/**
 * @typedef {Object} Applicant
 * @property {Business} business - Business details
 * @property {Customer} customer - Customer details
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
 * @import { PaymentCalculation } from '../services/land-grants.client.d.js'
 */
