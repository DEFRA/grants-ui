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
 * @typedef {object} GASAnswers
 * @property {string} [scheme] - Scheme
 * @property {number} [year] - Scheme year
 * @property {boolean} [hasCheckedLandIsUpToDate] - Land details are up to date
 * @property {ActionApplication[]} [actionApplications] - Action applications information
 */

/**
 * Transforms FormContext object into a GAS Application answers object for Land Grants.
 * @param {object} state
 * @returns {GASAnswers}
 */
export function stateToLandGrantsGasAnswers(state) {
  const { landParcels } = state
  const result = {
    hasCheckedLandIsUpToDate: state.hasCheckedLandIsUpToDate,
    agreementName: state.agreementName,
    scheme: 'SFI',
    year: 2025,
    actionApplications: []
  }

  if (landParcels && Object.keys(landParcels).length > 0) {
    for (const [parcelKey, data] of Object.entries(landParcels)) {
      const { actionsObj } = data
      const [sheetId, parcelId] = parcelKey.split('-') ?? []

      if (!actionsObj || Object.keys(actionsObj).length === 0) {
        continue
      }

      Object.entries(actionsObj).forEach(([actionCode, actionData]) => {
        const actionApplication = {
          code: actionCode,
          sheetId,
          parcelId
        }

        if (actionData && typeof actionData === 'object') {
          const appliedFor = {}

          if (actionData.unit != null) {
            appliedFor.unit = actionData.unit.trim()
          }

          if (actionData.value != null) {
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
  }
  return result
}
