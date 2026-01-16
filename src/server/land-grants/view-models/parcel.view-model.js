import { formatAreaUnit } from '~/src/server/land-grants/utils/format-area-unit.js'

/**
 * Maps land parcel data to view models for rendering in forms.
 * Handles transformation of parcel objects into radio button items with hints.
 */

/**
 * Formats a single parcel for display with area and actions information
 * @param {Parcel} parcel - The parcel to format
 * @param {number} actionsForParcel - Number of actions added to this parcel
 * @returns {RadioItem} View model for a single radio item
 */
export function formatParcelForView(parcel, actionsForParcel) {
  const hint = buildParcelHint(parcel, actionsForParcel)

  return {
    text: `${parcel.sheetId} ${parcel.parcelId}`,
    value: `${parcel.sheetId}-${parcel.parcelId}`,
    hint: hint ? { text: hint } : undefined
  }
}

/**
 * Builds the hint text for a parcel showing size and actions
 * @param {Parcel} parcel - The parcel data
 * @param {number} actionsForParcel - Number of actions added
 * @returns {string} Formatted hint text or empty string
 */
export function buildParcelHint(parcel, actionsForParcel) {
  const size = parcel.size || parcel.area
  const hasArea = size?.value && formatAreaUnit(size.unit)
  const hasActions = actionsForParcel > 0

  let hint = ''
  if (hasArea) {
    hint = `Total size ${size.value} ${formatAreaUnit(size.unit)}`
  }

  if (hasActions) {
    const actionsAddedStr = `${actionsForParcel} action${actionsForParcel > 1 ? 's' : ''} added`
    hint += hasArea ? `, ${actionsAddedStr}` : `${actionsAddedStr}`
  }

  return hint
}

/**
 * Maps an array of parcels to view models
 * @param {Array<Parcel>} parcels - Array of parcels to map
 * @param {object} landParcels - State object containing parcel data with actions
 * @returns {Array<RadioItem>} Array of radio items for view
 */
export function mapParcelsToViewModel(parcels, landParcels = {}) {
  return parcels.map((parcel) => {
    const parcelKey = `${parcel.sheetId}-${parcel.parcelId}`
    const parcelData = landParcels?.[parcelKey]
    const actionsForParcel = parcelData?.actionsObj ? Object.keys(parcelData.actionsObj).length : 0
    return formatParcelForView(parcel, actionsForParcel)
  })
}

/**
 * @typedef {object} Parcel
 * @property {string} sheetId - Sheet ID
 * @property {string} parcelId - Parcel ID
 * @property {object|null} [size] - Size information (primary, can be null from API)
 * @property {string|number} [size.value] - Size value
 * @property {string} [size.unit] - Size unit
 * @property {object} [area] - Area information (fallback for backwards compatibility)
 * @property {string} [area.value] - Area value
 * @property {string} [area.unit] - Area unit
 */

/**
 * @typedef {object} RadioItem
 * @property {string} text - Radio button label
 * @property {string} value - Radio button value
 * @property {object} [hint] - Optional hint configuration
 * @property {string} [hint.text] - Hint text content
 */
