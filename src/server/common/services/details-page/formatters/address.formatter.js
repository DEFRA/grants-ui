import { escapeHtml } from '~/src/server/common/utils/escape-html.js'

// Not keen on having to add `null` as a type to all these values, but to allow typechecking
// with jsdoc it is necessary without using full-blown TypeScript

/**
 * @typedef {object} AddressBase
 * @property {string|null} line1
 * @property {string|null} [line2]
 * @property {string|null} [line3]
 * @property {string|null} [line4]
 * @property {string|null} [line5]
 * @property {string|null} [street]
 * @property {string|null} city
 * @property {string|null} postalCode
 */

/**
 * @typedef {AddressBase & {
 *   uprn: string,
 *   county?: string | null,
 *   buildingName?: string | null,
 *   buildingNumberRange?: string | null,
 *   dependentLocality?: string | null,
 *   doubleDependentLocality?: string | null,
 *   flatName?: string | null,
 *   pafOrganisationName?: string | null
 * }} AddressWithUprn
 */

/**
 * @typedef {AddressBase & {
 *   uprn?: null,
 *   county?: null,
 *   buildingName?: null,
 *   buildingNumberRange?: null,
 *   dependentLocality?: null,
 *   doubleDependentLocality?: null,
 *   flatName?: null,
 *   pafOrganisationName?: null
 * }} AddressWithoutUprn
 */

/**
 * @typedef {AddressWithUprn | AddressWithoutUprn} Address
 */

/**
 * Address formatter - formats address object as HTML with line breaks
 * @param {Address} value - Address object with line1, line2, etc. properties
 * @returns {{ html: string } | null} Formatted value object or null if empty
 */
export function addressFormatter(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const address = evaluateValueToAddress(value)

  const addressParts = [address.line1, address.line2, address.line3, address.line4, address.city, address.postalCode]
    .filter(Boolean)
    .map((part) => escapeHtml(String(part).trim()))
    .filter((part) => part.length > 0)

  if (addressParts.length === 0) {
    return null
  }

  return { html: addressParts.join('<br/>') }
}

/**
 * Evaluates the input object and returns a standardized address object
 * @param {Address} value - The input address data
 * @returns {AddressBase} Standardized address object
 */
function evaluateValueToAddress(value) {
  const commonFields = {
    city: value.city,
    postalCode: value.postalCode
  }

  if (value.uprn) {
    const { flatName, buildingName, buildingNumberRange, street, dependentLocality, doubleDependentLocality } = value
    const buildingParts = [flatName, buildingName, buildingNumberRange, street].filter(Boolean)
    const buildingLine = buildingParts.length > 0 ? buildingParts.join(' ') : null

    const [line1 = '', line2, line3, line4] = [
      value.pafOrganisationName,
      buildingLine,
      dependentLocality,
      doubleDependentLocality
    ].filter(Boolean)

    return {
      ...commonFields,
      line1,
      line2,
      line3,
      line4
    }
  } else {
    return {
      ...commonFields,
      line1: value.line1,
      line2: value.line2,
      line3: value.line3,
      line4: value.street
    }
  }
}
