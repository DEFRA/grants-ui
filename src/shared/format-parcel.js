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
 * @param {string | null | undefined} landParcel - The land parcel identifier
 * @returns {string[]} - Array containing [sheetId, parcelId]
 */
export const parseLandParcel = (landParcel) => {
  return (landParcel || '').split('-')
}

/**
 * Converts landParcel object into a string
 * @param {ParcelIdentifier} parcel
 * @returns {string}
 */
export const stringifyParcel = ({ parcelId, sheetId }) => `${sheetId}-${parcelId}`

/**
 * Formats a parcel reference for display, e.g. "SD7946 0155". This is the
 * single source of truth for how a parcel reference is shown to users; it
 * must not be used for URLs or state keys (use stringifyParcel for those).
 * Accepts either a parcel identifier object or a compound id string
 * (e.g. "SD7946-0155").
 * @param {ParcelIdentifier | string} parcel
 * @returns {string}
 */
export const formatParcelReference = (parcel) => {
  const [sheetId, parcelId] = typeof parcel === 'string' ? parseLandParcel(parcel) : [parcel.sheetId, parcel.parcelId]
  return [sheetId, parcelId].filter((part) => part != null && part !== '').join(' ')
}

/**
 * @typedef {{ sheetId: string, parcelId: string }} ParcelIdentifier
 */
