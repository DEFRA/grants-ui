// A compound parcel id is a 6-character sheet id, a hyphen, then a 4-digit
// parcel id (e.g. "SD7946-0155").
export const COMPOUND_PARCEL_ID_PATTERN = /^[A-Za-z0-9]{6}-\d{4}$/

/**
 * @param {string} landParcel
 * @returns {boolean}
 */
export const isValidCompoundParcelId = (landParcel) => COMPOUND_PARCEL_ID_PATTERN.test(landParcel)

/**
 * Parse land parcel
 * @param {string} landParcel - The land parcel identifier
 * @returns {string[]} - Array containing [sheetId, parcelId]
 */
export const parseLandParcel = (landParcel) => {
  return (landParcel || '').split('-')
}

/**
 * Converts landParcel object into a string
 * @param {object} parcel
 * @param {string} parcel.parcelId
 * @param {string} parcel.sheetId
 * @returns {string}
 */
export const stringifyParcel = ({ parcelId, sheetId }) => `${sheetId}-${parcelId}`
