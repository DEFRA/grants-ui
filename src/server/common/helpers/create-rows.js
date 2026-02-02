import { formatPhone } from '~/src/server/land-grants/utils/format-phone.js'

/**
 * Utility functions for creating form display rows
 */

/**
 * Create customer name row if available
 * @param {object} name - Name object with first, middle, last properties
 * @returns {object|null} Row object or null if no valid name
 */
export function createCustomerNameRow(name) {
  if (!name) {
    return null
  }

  const fullName = [name.first, name.middle, name.last].filter(Boolean).join(' ')

  if (!fullName) {
    return null
  }

  return {
    key: { text: 'Name' },
    value: { text: fullName }
  }
}

/**
 * Create business name row if available
 * @param {string} businessName - Business name
 * @returns {object|null} Row object or null if no business name
 */
export function createBusinessNameRow(businessName) {
  if (!businessName) {
    return null
  }

  return {
    key: { text: 'Business name' },
    value: { text: businessName }
  }
}

/**
 * Create address row if available
 * @param {object} address - Address object
 * @returns {object|null} Row object or null if no valid address
 */
export function createAddressRow(address) {
  if (!address) {
    return null
  }

  const addressParts = [address.line1, address.line2, address.line3, address.street, address.city, address.postalCode]
    .filter(Boolean)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (addressParts.length === 0) {
    return null
  }

  return {
    key: { text: 'Address' },
    value: { html: addressParts.join('<br/>') }
  }
}

/**
 * Create SBI number row
 * @param {string} sbi - SBI number
 * @returns {object} Row object with SBI number
 */
export function createSbiRow(sbi) {
  return {
    key: { text: 'SBI number' },
    value: { text: sbi }
  }
}

/**
 * Create contact details row if available
 * @param {string | null} landline - Landline phone number
 * @param {string | null} mobile - Mobile phone number
 * @param {string | null} emailAddress - Email address
 * @returns {object|null} Row object or null if no contact details
 */
export function createContactDetailsRow(landline, mobile, emailAddress) {
  const contactParts = []

  if (landline) {
    contactParts.push(formatPhone(landline))
  }

  if (mobile) {
    contactParts.push(formatPhone(mobile))
  }

  if (emailAddress) {
    contactParts.push(emailAddress)
  }

  if (contactParts.length === 0) {
    return null
  }

  return {
    key: { text: 'Contact details' },
    value: { html: contactParts.join('<br/>') }
  }
}
