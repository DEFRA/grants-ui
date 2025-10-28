/**
 * Creates an appliedFor object from action data
 * @param {object} actionData - The action data object
 * @returns {AppliedFor} The appliedFor object
 */
function createAppliedForObject(actionData) {
  const appliedFor = {}

  if (actionData.unit != null) {
    appliedFor.unit = actionData.unit.trim()
  }

  if (actionData.value != null) {
    const quantity = Number.parseFloat(actionData.value)
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
 * @returns {ActionApplication} The action application object
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
 * @returns {ActionApplication[]} Array of action applications
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
 * @returns {Answers}
 */
export function stateToLandGrantsGasAnswers(state) {
  const { landParcels, applicationValidationRunId } = state
  /** @type {ActionApplication[]} */
  const actionApplications = []
  const result = {
    hasCheckedLandIsUpToDate: true,
    scheme: 'SFI',
    year: 2025,
    actionApplications,
    applicationValidationRunId: `${applicationValidationRunId}`
  }

  if (state.payment) {
    result.payment = state.payment
  }
  if (state.applicant) {
    result.applicant = state.applicant
  }

  if (!landParcels || Object.keys(landParcels).length === 0) {
    return result
  }

  for (const [parcelKey, data] of Object.entries(landParcels)) {
    const { actionsObj } = data
    const [sheetId, parcelId] = parcelKey.split('-') ?? []

    const parcelActions = processParcelActions(actionsObj, sheetId, parcelId)
    result.actionApplications.push(...parcelActions)
  }

  return result
}

/**
 * @import { Answers, AppliedFor, ActionApplication} from '~/src/server/land-grants/types/gas-payload.d.js'
 */
