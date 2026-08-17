import { formatParcelReference, stringifyParcel } from '~/src/shared/format-parcel.js'

/**
 * Single source of truth for the land-parcel titles and journey hrefs shared by
 * the payment summary pages. Keeping these here stops the two view models
 * drifting apart on route names or on the accessible names they announce.
 */

/**
 * URL-safe compound parcel id (`SD1234-5678`) for use in a query string.
 * @param {string} sheetId
 * @param {string} parcelId
 * @returns {string}
 */
export const parcelIdParam = (sheetId, parcelId) => encodeURIComponent(stringifyParcel({ sheetId, parcelId }))

/**
 * Bare land parcel reference (`SD1234 5678`), used where the surrounding
 * context already says it is a land parcel. Delegates to the shared formatter
 * so display references have one definition service-wide.
 * @param {string} sheetId
 * @param {string} parcelId
 * @returns {string}
 */
export const landParcelReference = (sheetId, parcelId) => formatParcelReference({ sheetId, parcelId })

/**
 * User-facing land parcel title. Uses the `CONTEXT.md` glossary casing.
 * @param {string} sheetId
 * @param {string} parcelId
 * @returns {string}
 */
export const landParcelTitle = (sheetId, parcelId) => `Land parcel ${landParcelReference(sheetId, parcelId)}`

/**
 * @param {string} sheetId
 * @param {string} parcelId
 * @returns {string}
 */
export const removeParcelHref = (sheetId, parcelId) => `remove-parcel?parcelId=${parcelIdParam(sheetId, parcelId)}`

/**
 * @param {string} sheetId
 * @param {string} parcelId
 * @returns {string}
 */
export const changeActionsHref = (sheetId, parcelId) =>
  `select-actions-for-land-parcel?parcelId=${parcelIdParam(sheetId, parcelId)}`

/**
 * @param {string} sheetId
 * @param {string} parcelId
 * @param {string} code
 * @returns {string}
 */
export const removeActionHref = (sheetId, parcelId, code) =>
  `remove-action?parcelId=${parcelIdParam(sheetId, parcelId)}&action=${encodeURIComponent(code)}`
