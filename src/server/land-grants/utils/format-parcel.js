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
 * @param {object} parcel.parcelId
 * @param {object} parcel.sheetId
 * @returns {string}
 */
export const stringifyParcel = ({ parcelId, sheetId }) => `${sheetId}-${parcelId}`
