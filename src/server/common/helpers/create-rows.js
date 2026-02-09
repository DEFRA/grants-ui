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
 * Build summary list rows from field definitions.
 * Mandatory fields are always included. Optional fields are hidden when their value is empty.
 * @param {{ label: string, value: any, mandatory?: boolean }[]} fields
 * @returns {{ rows: object[] }}
 */
export function buildRows(fields) {
  return {
    rows: fields
      .filter(({ value, mandatory }) => mandatory || Boolean(value))
      .map(({ label, value }) => ({
        key: { text: label },
        value: { text: value }
      }))
  }
}

/**
 * Create person detail rows for detailed view.
 * @param {object} name - Name object with title, first, middle, last properties
 * @returns {{ rows: object[] }} Rows object
 */
export function createPersonRows(name) {
  return buildRows([
    { label: 'Title', value: name?.title, mandatory: true },
    { label: 'First name', value: name?.first, mandatory: true },
    { label: 'Middle name', value: name?.middle },
    { label: 'Last name', value: name?.last, mandatory: true }
  ])
}

/**
 * Create contact detail rows for detailed view.
 * @param {object} business - Business data with phone numbers and email
 * @returns {{ rows: object[] }} Rows object
 */
export function createContactRows(business) {
  return buildRows([
    { label: 'Landline number', value: formatPhone(business?.landlinePhoneNumber) },
    { label: 'Mobile number', value: formatPhone(business?.mobilePhoneNumber) },
    { label: 'Email address', value: business?.email }
  ])
}

/**
 * Create business detail rows for detailed view.
 * @param {string} sbi - SBI number
 * @param {string} organisationName - Business name
 * @param {object} business - Business data
 * @returns {{ rows: object[] }} Rows object
 */
export function createBusinessRows(sbi, organisationName, business) {
  const address = business?.address
  return buildRows([
    { label: 'Business name', value: organisationName, mandatory: true },
    { label: 'Address 1', value: address?.line1, mandatory: true },
    { label: 'Address 2', value: address?.line2 },
    { label: 'Address 3', value: address?.line3 },
    { label: 'Address 4', value: address?.line4 },
    { label: 'City', value: address?.city, mandatory: true },
    { label: 'Postcode', value: address?.postalCode, mandatory: true },
    { label: 'SBI number', value: sbi, mandatory: true }
  ])
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

  const addressParts = [address.line1, address.line2, address.line3, address.line4, address.city, address.postalCode]
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
