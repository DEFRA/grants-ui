import { formatPhone } from '~/src/server/land-grants/utils/format-phone.js'

/**
 * Utility functions for creating form display rows
 */

/**
 * Create customer name row if available
 * @param {Name | null | undefined} name
 * @returns {SummaryListRow | null}
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
 * @param {RowField[]} fields
 * @returns {{ rows: SummaryListRow[] }}
 */
export function buildRows(fields) {
  return {
    rows: fields
      .filter(({ value, mandatory }) => mandatory || Boolean(value))
      .map(({ label, value }) => ({
        key: { text: label },
        value: value
          ? { text: value }
          : {
              html: '<span class="govuk-visually-hidden" aria-describedby="missing-fields-warning">This information is missing</span>'
            }
      }))
  }
}

/**
 * Create person detail rows for detailed view.
 * @param {Name | null | undefined} name
 * @returns {{ rows: SummaryListRow[] }}
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
 * @param {Business | null | undefined} business
 * @returns {{ rows: SummaryListRow[] }}
 */
export function createContactRows(business) {
  return buildRows([
    { label: 'Landline number', value: formatPhone(/** @type {string} */ (business?.landlinePhoneNumber)) },
    { label: 'Mobile number', value: formatPhone(/** @type {string} */ (business?.mobilePhoneNumber)) },
    {
      label: 'Email address',
      value:
        /** @type {{ address?: string } | undefined} */ (business?.email)?.address ??
        /** @type {string | undefined} */ (business?.email)
    }
  ])
}

/**
 * Create business detail rows for detailed view.
 * @param {string} sbi - SBI number
 * @param {Business | null | undefined} business
 * @returns {{ rows: SummaryListRow[] }}
 */
export function createBusinessRows(sbi, business) {
  const address = business?.address
  return buildRows([
    { label: 'Business name', value: business?.name, mandatory: true },
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
 * @param {string | null | undefined} businessName
 * @returns {SummaryListRow | null}
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
 * @param {Address | null | undefined} address
 * @returns {SummaryListRow | null}
 */
export function createAddressRow(address) {
  if (!address) {
    return null
  }

  const addressParts = /** @type {string[]} */ (
    [address.line1, address.line2, address.line3, address.line4, address.city, address.postalCode].filter(Boolean)
  )
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
 * @returns {SummaryListRow}
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
 * @returns {SummaryListRow | null}
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

/**
 * @typedef {{ title?: string, first?: string, middle?: string, last?: string }} Name
 * @typedef {{ line1?: string, line2?: string, line3?: string, line4?: string, city?: string, postalCode?: string }} Address
 * @typedef {{ name?: string, address?: Address, landlinePhoneNumber?: string, mobilePhoneNumber?: string, email?: string | { address?: string } }} Business
 * @typedef {{ key: { text: string }, value: { text: string } | { html: string } }} SummaryListRow
 * @typedef {{ label: string, value: string | null | undefined, mandatory?: boolean }} RowField
 */
