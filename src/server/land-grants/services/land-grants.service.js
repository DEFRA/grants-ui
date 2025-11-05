import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
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

// NOSONAR TODO: Ideally this needs to come from the backend
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
 * @returns {Promise<{payment: PaymentCalculation, errorMessage?: string, paymentTotal: string}>} - Payment calculation result
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
 * Creates a group with passed name and actions
 * @param {string} name
 * @param {ActionOption[]} groupActions
 * @returns {ActionGroup}- Parcel data with actions
 */
const createGroup = (name, groupActions) => ({
  name,
  totalAvailableArea: {
    unit: groupActions[0]?.availableArea.unit,
    value: Math.max(...groupActions.map((item) => item.availableArea.value))
  },
  actions: groupActions
})

/**
 * Fetches available actions for a given parcel.
 * @param {{ parcelId: string, sheetId: string }} parcel
 * @returns {Promise<{actions: ActionGroup[], parcel: {parcelId: string, sheetId: string, size: Size}}>}- Parcel data with actions
 * @throws {Error}
 */
export async function fetchAvailableActionsForParcel({ parcelId = '', sheetId = '' }) {
  const actions = []
  const parcelIds = [stringifyParcel({ sheetId, parcelId })]
  const { parcels } = await parcelsWithActionsAndSize(parcelIds, LAND_GRANTS_API_URL)
  const foundParcel = parcels?.find((p) => p.parcelId === parcelId && p.sheetId === sheetId)
  const actionsForParcel = foundParcel?.actions?.map(mapAction) || []
  const usedCodes = new Set()

  actionGroups.forEach((group) => {
    const groupActions = actionsForParcel.filter((a) => group.actions.includes(a.code))
    if (groupActions.length > 0) {
      for (const action of groupActions) {
        usedCodes.add(action.code)
      }
      actions.push(createGroup(group.name, groupActions))
    }
  })

  const ungroupedActions = actionsForParcel.filter((a) => !usedCodes.has(a.code))
  if (ungroupedActions.length > 0) {
    actions.push(createGroup('', ungroupedActions))
  }

  return {
    parcel: {
      sheetId,
      parcelId,
      size: {
        unit: foundParcel?.size?.unit ?? '',
        value: foundParcel?.size?.value ?? 0
      }
    },
    actions
  }
}

/**
 *
 * @param {ActionOption} action
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
 * @returns {Promise<Object.<string, number>>}
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
 * @param {Request} request
 * @returns {Promise<Parcel[]>}
 * @throws {Error}
 */
export async function fetchParcels(request) {
  const parcels = await fetchParcelsFromDal(request)
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
 * @returns {Promise<ValidateApplicationResponse>}
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
 * @import { ActionOption, LandActions, ActionGroup, Parcel, ValidateApplicationResponse, Action, Size } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 */
