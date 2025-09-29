import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsForSbi } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { landActionWithCode } from '~/src/server/land-grants/utils/land-action-with-code.js'
import { stringifyParcel } from '../utils/format-parcel.js'
import { stateToLandActionsMapper } from '../mappers/state-to-land-grants-mapper.js'

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
 * Calculates grant payment for land actions.
 * @param {LandActions[]} state
 * @returns {Promise<object>} - Payment calculation result
 * @throws {Error}
 */
export async function calculateGrantPayment(state) {
  const payload = { landActions: stateToLandActionsMapper(state) }
  const { payment } = await calculate(payload, LAND_GRANTS_API_URL)
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
 * @returns - Parcel data with actions
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
 * @returns Map of parcel string IDs to their sizes
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
 * @param {string} data.sbi
 * @param {object} data.state
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

  return validate(payload, LAND_GRANTS_API_URL)
}

/**
 * @import { LandActions } from './land-grants.client.d.js'
 */
