/**
 * @typedef {object} ActionArea
 * @property {string} unit - Area units (ha, m2, etc)
 * @property {number} quantity - Area value
 */

/**
 * @typedef {object} ActionApplication
 * @property {string} parcelId - The parcel identifier
 * @property {string} sheetId - The sheet identifier
 * @property {string} code - Action code
 * @property {ActionArea} appliedFor - Area applied for
 */

/**
 * @typedef {object} GASPayload
 * @property {string} sbi - Standard Business Identifier
 * @property {string} frn - FRN
 * @property {string} crn - Customer Reference Number
 * @property {string} defraId - Defra ID
 * @property {string} scheme - Scheme
 * @property {number} year - Scheme year
 * @property {hasCheckedLandIsUpToDate} boolean - Land details are up to date
 * @property {ActionApplication[]} actionApplications - Action applications information
 */

/**
 * Transforms FormContext object into a GAS Application payload for Land Grants.
 * @param {object} stateObj
 * @returns {GASPayload}
 */
export function transformStateObjectToGasApplication(stateObj) {
  const result = {}
  const basicProps = [
    'sbi',
    'frn',
    'crn',
    'defraId',
    'scheme',
    'year',
    'hasCheckedLandIsUpToDate'
  ]
  basicProps.forEach((prop) => {
    if (stateObj[prop] !== undefined) {
      result[prop] = stateObj[prop]
    }
  })

  if (stateObj.landParcel && stateObj.actionsObj) {
    result.actionApplications = []
    const [sheetId, parcelId] = stateObj ? stateObj.landParcel?.split('-') : []

    Object.entries(stateObj.actionsObj).forEach(([actionCode, actionData]) => {
      const actionApplication = {
        code: actionCode
      }

      if (sheetId) {
        actionApplication.sheetId = sheetId
      }
      if (parcelId) {
        actionApplication.parcelId = parcelId
      }

      // Process the applied for data
      if (actionData && typeof actionData === 'object') {
        const appliedFor = {}

        if (actionData.unit !== undefined) {
          appliedFor.unit = actionData.unit.trim()
        }

        if (actionData.value !== undefined) {
          const quantity = parseFloat(actionData.value)
          appliedFor.quantity = !isNaN(quantity) ? quantity : undefined
        }
        if (Object.keys(appliedFor).length > 0) {
          actionApplication.appliedFor = appliedFor
        }
      }

      result.actionApplications.push(actionApplication)
    })
  }
  return result
}
