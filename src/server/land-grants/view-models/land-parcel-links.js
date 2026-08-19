import { formatParcelReference, stringifyParcel } from '~/src/shared/format-parcel.js'

/**
 * Land parcel titles and journey hrefs shared by the payment summary pages, so
 * the two view models cannot drift apart on route names or on the accessible
 * names they announce.
 */

/**
 * URL-safe compound parcel id (`SD1234-5678`) for use in a query string.
 * @param {string} sheetId
 * @param {string} parcelId
 * @returns {string}
 */
export const parcelIdParam = (sheetId, parcelId) => encodeURIComponent(stringifyParcel({ sheetId, parcelId }))

/**
 * Land parcel reference on its own (`SD1234 5678`), for use where the
 * surrounding context already says it is a land parcel. Delegates to the shared
 * formatter so the display format has one definition.
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
