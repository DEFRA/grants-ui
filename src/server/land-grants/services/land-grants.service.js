import { config } from '~/src/config/config.js'
import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsForSbi } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { landActionWithCode } from '~/src/server/land-grants/utils/land-action-with-code.js'
import { stringifyParcel } from '../utils/format-parcel.js'
import { stateToLandActionsMapper } from '../mappers/state-to-land-grants-mapper.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')

// TODO: This needs to come from the backend
export const actionGroups = [
  {
    name: 'Assess moorland',
    actions: ['CMOR1']
  },
  {
    name: 'Livestock grazing on moorland',
    actions: ['UPL1', 'UPL2', 'UPL3']
  }
]

/**
 * Performs a POST request to the Land Grants API.
 * @param {string} endpoint
 * @param {object} body
 * @returns {Promise<any>}
 * @throws {Error}
 */
export async function postToLandGrantsApi(endpoint, body) {
  const response = await fetch(`${LAND_GRANTS_API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    /**
     * @type {Error & {code?: number}}
     */
    const error = new Error(response.statusText)
    error.code = response.status
    throw error
  }

  return response.json()
}

/**
 * Calculates grant payment for land actions.
 * @param {{ sheetId: string, parcelId: string, actionsObj: object }} landParcels
 * @returns {Promise<object>} - Payment calculation result
 * @throws {Error}
 */
export async function calculateGrantPayment(state) {
  const payload = { landActions: stateToLandActionsMapper(state) }
  const data = await postToLandGrantsApi('/payments/calculate', payload)
  const paymentTotal = formatCurrency(data.payment?.annualTotalPence / 100)

  return {
    ...data,
    errorMessage: paymentTotal == null ? 'Error calculating payment. Please try again later.' : undefined,
    paymentTotal
  }
}

/**
 * Fetches available actions for a given parcel.
 * @param {{ parcelId: string, sheetId: string }} parcel
 * @returns {Promise<object>} - Parcel data with actions
 * @throws {Error}
 */
export async function fetchAvailableActionsForParcel({ parcelId = '', sheetId = '' }) {
  const parcelIds = [stringifyParcel({ sheetId, parcelId })]
  const fields = ['actions', 'size']
  const data = await postToLandGrantsApi('/parcels', { parcelIds, fields })
  const actions =
    data.parcels?.find((p) => p.parcelId === parcelId && p.sheetId === sheetId)?.actions.map(mapAction) || []
  const result = []
  const usedCodes = new Set()

  const createGroup = (name, groupActions) => ({
    name,
    totalAvailableArea: {
      unit: groupActions[0]?.availableArea.unit,
      value: Math.max(...groupActions.map((item) => item.availableArea.value))
    },
    actions: groupActions
  })

  actionGroups.forEach((group) => {
    const groupActions = actions.filter((a) => group.actions.includes(a.code))
    if (groupActions.length > 0) {
      groupActions.forEach((a) => usedCodes.add(a.code))
      result.push(createGroup(group.name, groupActions))
    }
  })

  const ungroupedActions = actions.filter((a) => !usedCodes.has(a.code))
  if (ungroupedActions.length > 0) {
    result.push(createGroup('', ungroupedActions))
  }
  return result
}

/**
 *
 * @param {{description: string, code: string}} action
 * @returns {any}
 */
function mapAction(action) {
  return {
    ...action,
    description: landActionWithCode(action.description, action.code)
  }
}

/**
 * Fetches parcel size for a list of parcel IDs.
 * @param {string[]} parcelIds
 * @returns {Promise<object>} - Map of parcel string IDs to their sizes
 * @throws {Error}
 */
async function fetchParcelsSize(parcelIds) {
  const data = await postToLandGrantsApi('/parcels', {
    parcelIds,
    fields: ['size']
  })
  return data.parcels.reduce((acc, p) => {
    acc[stringifyParcel(p)] = p.size
    return acc
  }, {})
}

/**
 * Fetches parcels with area data for a given SBI.
 * @param {string} sbi - Single Business Identifier
 * @returns {Promise<object[]>}
 * @throws {Error}
 */
export async function fetchParcels(sbi) {
  const parcels = await fetchParcelsForSbi(sbi)
  const parcelKeys = parcels.map(stringifyParcel)
  const sizes = await fetchParcelsSize(parcelKeys)
  const hydratedParcels = parcels.map((p) => ({
    ...p,
    area: sizes[stringifyParcel(p)] || {}
  }))
  return hydratedParcels
}

/**
 * Validates the application
 * @param {object} data
 * @param {string} data.applicationId
 * @param {string} data.crn
 * @param {string} data.sbi
 * @param {object} data.state
 * @returns {Promise<{ id: string}>}
 * @throws {Error}
 */
export async function validateApplication(data) {
  const { applicationId, crn, state, sbi } = data

  const payload = {
    applicationId: applicationId?.toLowerCase(),
    requester: 'grants-ui',
    sbi,
    applicantCrn: crn,
    landActions: stateToLandActionsMapper(state)
  }

  return postToLandGrantsApi('/application/validate', payload)
}
