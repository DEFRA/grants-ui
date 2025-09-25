import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsForSbi } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { sbiStore } from '../../sbi/state.js'
import { landActionWithCode } from '~/src/server/land-grants/utils/land-action-with-code.js'

import { config } from '~/src/config/config.js'
import {
  calculate,
  parcelsWithActionsAndSize,
  parcelsWithSize,
  validate
} from '~/src/server/land-grants/services/land-grants.client.js'

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
 * @param {string | null | undefined} landParcel - The land parcel identifier
 * @returns {string[]} - Array containing [sheetId, parcelId]
 */
export const parseLandParcel = (landParcel) => {
  return (landParcel || '').split('-')
}

export const stringifyParcel = ({ parcelId, sheetId }) => `${sheetId}-${parcelId}`

/**
 * Maps land actions into the expected payload structure for the API.
 * @param {{ sheetId: string, parcelId: string, actionsObj: {[code: string]: {description: string, value: string, unit: string}} | {}, sbi: string }} param0
 * @returns {{ sheetId: string, parcelId: string, actions: { code: string, quantity: number }[], sbi: string }}
 */
export const landActionsToApiPayload = ({ sheetId, parcelId, actionsObj, sbi }) => {
  const sbiValue = sbi || sbiStore.get('sbi')
  return {
    sheetId,
    parcelId,
    sbi: sbiValue,
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
 * @param {LandActions[]} landParcels
 * @returns {Promise<object>} - Payment calculation result
 * @throws {Error}
 */
export async function calculateGrantPayment(landParcels) {
  const { payment } = await calculate(landParcels, LAND_GRANTS_API_URL)
  const paymentTotal = formatCurrency(payment?.annualTotalPence / 100)

  return {
    payment,
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

  const { parcels } = await parcelsWithActionsAndSize(parcelIds, LAND_GRANTS_API_URL)

  const actions = parcels?.find((p) => p.parcelId === parcelId && p.sheetId === sheetId)?.actions?.map(mapAction) || []
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
  const { parcels } = await parcelsWithSize(parcelIds, LAND_GRANTS_API_URL)

  return parcels.reduce((acc, p) => {
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
 * @param {object} data.landParcels
 * @param {string} data.sbi
 * @returns
 * @throws {Error}
 */
export async function validateApplication(data) {
  const { applicationId, crn, landParcels, sbi } = data

  const payload = {
    applicationId,
    requester: 'grants-ui',
    applicantCrn: crn,
    sbi,
    landActions: Object.entries(landParcels)
      .filter(([parcelKey]) => parcelKey)
      .map(([parcelKey, parcelData]) => {
        const [sheetId, parcelId] = parcelKey.split('-')
        return landActionsToApiPayload({ sheetId, parcelId, actionsObj: parcelData.actionsObj })
      })
  }

  return validate(payload, LAND_GRANTS_API_URL)
}

/**
 * @import { LandActions } from './land-grants.client.d.js'
 */
