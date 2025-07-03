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
 * Creates an appliedFor object from action data
 * @param {object} actionData - The action data object
 * @returns {object} The appliedFor object
 */
function createAppliedForObject(actionData) {
  const appliedFor = {}

  if (actionData.unit != null) {
    appliedFor.unit = actionData.unit.trim()
  }

  if (actionData.value != null) {
    const quantity = parseFloat(actionData.value)
    appliedFor.quantity = !isNaN(quantity) ? quantity : undefined
  }

  return appliedFor
}

/**
 * Processes a single action and creates an action application
 * @param {string} actionCode - The action code
 * @param {object} actionData - The action data
 * @param {string} sheetId - The sheet ID
 * @param {string} parcelId - The parcel ID
 * @returns {object} The action application object
 */
function createActionApplication(actionCode, actionData, sheetId, parcelId) {
  const actionApplication = {
    code: actionCode,
    sheetId,
    parcelId
  }

  if (actionData && typeof actionData === 'object') {
    const appliedFor = createAppliedForObject(actionData)

    if (Object.keys(appliedFor).length > 0) {
      actionApplication.appliedFor = appliedFor
    }
  }

  return actionApplication
}

/**
 * Processes actions for a single parcel
 * @param {object} actionsObj - The actions object
 * @param {string} sheetId - The sheet ID
 * @param {string} parcelId - The parcel ID
 * @returns {object[]} Array of action applications
 */
function processParcelActions(actionsObj, sheetId, parcelId) {
  if (!actionsObj || Object.keys(actionsObj).length === 0) {
    return []
  }

  return Object.entries(actionsObj).map(([actionCode, actionData]) =>
    createActionApplication(actionCode, actionData, sheetId, parcelId)
  )
}

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

  if (!landParcels || Object.keys(landParcels).length === 0) {
    return result
  }

  for (const [parcelKey, data] of Object.entries(landParcels)) {
    const { actionsObj } = data
    const [sheetId, parcelId] = parcelKey.split('-') ?? []

    const actionApplications = processParcelActions(
      actionsObj,
      sheetId,
      parcelId
    )
    result.actionApplications.push(...actionApplications)
  }

  return result
}
