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
