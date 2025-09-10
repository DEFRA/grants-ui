import { config } from '~/src/config/config.js'
import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsForSbi } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { sbiStore } from '../../sbi/state.js'

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
 * Parse land parcel identifier
 * @param {string} landParcel - The land parcel identifier
 * @returns {string[]} - Array containing [sheetId, parcelId]
 */
export const parseLandParcel = (landParcel) => {
  return (landParcel || '').split('-')
}

export const stringifyParcel = ({ parcelId, sheetId }) => `${sheetId}-${parcelId}`

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
 * Maps land actions into the expected payload structure for the API.
 * @param {{ sheetId: string, parcelId: string, actionsObj: object }} param0
 * @returns {object}
 */
export const landActionsToApiPayload = ({ sheetId, parcelId, actionsObj }) => {
  const sbi = sbiStore.get('sbi') // TODO: change this once DefraID is in place
  return {
    sheetId,
    parcelId,
    sbi,
    actions: actionsObj
      ? Object.entries(actionsObj).map(([code, area]) => ({
          code,
          quantity: Number(area.value)
        }))
      : []
  }
}

/**
 * Calculates grant payment for land actions.
 * @param {{ sheetId: string, parcelId: string, actionsObj: object }} landParcels
 * @returns {Promise<object>} - Payment calculation result
 * @throws {Error}
 */
export async function calculateGrantPayment(landParcels) {
  const data = await postToLandGrantsApi('/payments/calculate', landParcels)

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
  const actions = data.parcels?.find((p) => p.parcelId === parcelId && p.sheetId === sheetId)?.actions.map(mapAction) || []
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
    description: `${action.description}: ${action.code}`
  }
}

/**
 * Validates land actions through the Land Grants API.
 * @param {{ sheetId: string, parcelId: string, actionsObj: object }} payload
 * @returns {Promise<object>} - Validation result
 * @throws {Error}
 */
export async function triggerApiActionsValidation({ sheetId, parcelId, actionsObj = {} }) {
  return postToLandGrantsApi('/actions/validate', {
    landActions: [landActionsToApiPayload({ sheetId, parcelId, actionsObj })]
  })
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
