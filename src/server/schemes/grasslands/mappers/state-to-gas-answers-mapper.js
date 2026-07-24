/**
 * @typedef {object} MappedAction
 * @property {string} code - The action code (e.g. 'CLIG3')
 * @property {unknown} value - The applied-for value for the action
 * @property {unknown} unit - The unit for the value (e.g. 'ha')
 */

/**
 * @typedef {object} MappedParcel
 * @property {string} parcelId - The land parcel id (e.g. 'SD6352-8774')
 * @property {MappedAction[]} actions - The actions selected for the parcel
 */

/**
 * Maps a single land parcel's actions object into an array of actions,
 * keeping only the code, value and unit for each action.
 *
 * @param {Record<string, Record<string, unknown>> | undefined} actionsObj
 * @returns {MappedAction[]}
 */
const mapActions = (actionsObj) =>
  Object.entries(actionsObj ?? {}).map(([code, action]) => ({
    code,
    value: action?.value,
    unit: action?.unit
  }))

/**
 * Maps all land parcels from the raw state into an array of parcels,
 * each with its parcelId and the actions selected for it.
 *
 * @param {Record<string, Record<string, unknown>> | undefined} landParcels
 * @returns {MappedParcel[]}
 */
const mapParcels = (landParcels) =>
  Object.entries(landParcels ?? {}).map(([parcelId, parcel]) => ({
    parcelId,
    actions: mapActions(/** @type {Record<string, Record<string, unknown>> | undefined} */ (parcel?.actionsObj))
  }))

/**
 * Transforms the raw submission state into the answers shape expected by GAS
 * for the grasslands journey.
 *
 * @param {Record<string, unknown>} submissionState
 * @param {Record<string, unknown>} rawState
 * @returns {object}
 */
export const transformGrasslandsAnswers = (submissionState, rawState) => {
  const { ...rest } = submissionState
  delete rest.selectedParcelsDisplay
  delete rest.landParcels
  delete rest.selectedParcelId

  const parcels = mapParcels(/** @type {Record<string, Record<string, unknown>> | undefined} */ (rawState.landParcels))

  return {
    ...rest,
    parcels
  }
}
