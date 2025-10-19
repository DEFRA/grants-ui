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
 * @param {string} mobile - Mobile phone number
 * @param {string} emailAddress - Email address
 * @returns {object|null} Row object or null if no contact details
 */
export function createContactDetailsRow(mobile, emailAddress) {
  const contactParts = []

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

/**
 * Create VAT number row if available
 * @param {string} vat - VAT number
 * @returns {object|null} Row object or null if no VAT number
 */
export function createVATRow(vat) {
  if (!vat) {
    return null
  }

  return {
    key: { text: 'VAT number' },
    value: { text: vat }
  }
}

/**
 * Create County Parish Holdings row if available
 * @param {string[]} countyParishHoldings - Array of CPH numbers
 * @returns {object|null} Row object or null if no CPH data
 */
export function createCPHRow(countyParishHoldings) {
  if (!countyParishHoldings || countyParishHoldings.length === 0) {
    return null
  }

  return {
    key: { text: 'County Parish Holdings' },
    value: {
      text: countyParishHoldings
    }
  }
}

/**
 * Create business type row if available
 * @param {object} type - Type object with organisationType property
 * @returns {object|null} Row object or null if no type
 */
export function createTypeRow(type) {
  if (!type) {
    return null
  }

  const { type: organisationType } = type

  return {
    key: { text: 'Type' },
    value: { text: organisationType }
  }
}
