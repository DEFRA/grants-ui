import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { landActionWithCode } from '~/src/server/land-grants/utils/land-action-with-code.js'
import { stringifyParcel } from '../utils/format-parcel.js'
import { stateToLandActionsMapper } from '../mappers/state-to-land-grants-mapper.js'

import { config } from '~/src/config/config.js'
import { getConsentTypes } from '~/src/server/land-grants/utils/consent-types.js'
import {
  calculate,
  calculateWmp,
  parcelsGroups,
  parcelsWithExtendedInfo,
  parcelsWithSize,
  validate
} from '~/src/server/land-grants/services/land-grants.client.js'
import { formatAreaUnit } from '~/src/server/land-grants/utils/format-area-unit.js'
import {
  getCachedParcel,
  setCachedParcel,
  getCachedSbiParcels,
  setCachedSbiParcels
} from '~/src/server/land-grants/services/parcel-cache.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')

/**
 * Calculates grant payment for land actions.
 * @param {object} state
 * @returns {Promise<{payment: PaymentCalculation, errorMessage?: string, paymentTotal: string}>} - Payment calculation result
 * @throws {Error}
 */
export async function calculateLandActionsPayment(state) {
  const payload = {
    parcel: stateToLandActionsMapper(state)
  }
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
    unitFullName: formatAreaUnit(groupActions[0]?.availableArea.unit),
    unit: groupActions[0]?.availableArea.unit,
    value: Math.max(...groupActions.map((item) => item.availableArea.value))
  },
  actions: groupActions,
  consents: getConsentTypes()
    .filter((ct) => groupActions.some((a) => a[ct.apiField]))
    .map((ct) => ct.key)
})

/**
 * Fetches available actions for a given parcel.
 * @param {{ parcelId: string, sheetId: string }} parcel
 * @returns {Promise<{actions: ActionGroup[], parcel: {parcelId: string, sheetId: string, size: Size}}>}- Parcel data with actions
 * @throws {Error}
 */
export async function fetchAvailableActionsForParcel({ parcelId = '', sheetId = '' }) {
  const cacheKey = stringifyParcel({ sheetId, parcelId })
  const cached = getCachedParcel(cacheKey)

  if (cached) {
    return cached
  }

  const actions = []
  const parcelIds = [cacheKey]
  const { parcels, groups: groupDefinitions = [] } = await parcelsWithExtendedInfo(parcelIds, LAND_GRANTS_API_URL)
  const foundParcel = parcels?.find((p) => p.parcelId === parcelId && p.sheetId === sheetId)
  const actionsForParcel = foundParcel?.actions?.map(mapAction) || []

  groupDefinitions.forEach((group) => {
    const groupActions = actionsForParcel.filter((a) => {
      if (['UPL8', 'UPL10'].includes(a.code) && !config.get('landGrants.enableUpl8And10')) {
        return false
      }
      return group.actions.includes(a.code)
    })
    if (groupActions.length > 0) {
      actions.push(createGroup(group.name, groupActions))
    }
  })

  const result = {
    parcel: {
      sheetId,
      parcelId,
      size: {
        unitFullName: formatAreaUnit(foundParcel?.size?.unit ?? ''),
        unit: foundParcel?.size?.unit ?? '',
        value: foundParcel?.size?.value ?? 0
      }
    },
    actions
  }

  setCachedParcel(cacheKey, result)
  return result
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
 * Calculates a one-off WMP payment.
 * @param {{ parcelIds: string[], newWoodlandAreaHa: number, oldWoodlandAreaHa: number }} params
 * @returns {Promise<{ payment: object, totalPence: number }>}
 * @throws {Error}
 */
export async function calculateWmpPayment({ parcelIds, newWoodlandAreaHa, oldWoodlandAreaHa }) {
  const { payment } = await calculateWmp({ parcelIds, newWoodlandAreaHa, oldWoodlandAreaHa }, LAND_GRANTS_API_URL)
  const totalPence = payment?.agreementTotalPence ?? 0
  return { payment, totalPence }
}

/**
 * Fetches parcel groups for a list of parcel IDs.
 * @param {object} state
 * @returns {Promise<ActionGroupDefinition[]>}
 * @throws {Error}
 */
export async function fetchParcelsGroups(state) {
  const parcelIds = Object.keys(state.landParcels) || []
  if (!parcelIds.length) {
    return []
  }

  const { groups = [] } = await parcelsGroups(parcelIds, LAND_GRANTS_API_URL)
  return groups
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
 * @param {AnyFormRequest} request
 * @returns {Promise<Parcel[]>}
 * @throws {Error}
 */
export async function fetchParcels(request) {
  const sbi = request.auth?.credentials?.sbi
  const cached = getCachedSbiParcels(sbi)

  if (cached) {
    return cached
  }

  const parcels = await fetchParcelsFromDal(request)
  const parcelKeys = parcels.map(stringifyParcel)
  const sizes = await fetchParcelsSize(parcelKeys)
  const hydratedParcels = parcels.map((p) => ({
    ...p,
    area: sizes[stringifyParcel(p)] || {}
  }))

  setCachedSbiParcels(sbi, hydratedParcels)
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

  const result = await validate(payload, LAND_GRANTS_API_URL)
  result.errorMessages = buildErrorMessagesFromResponse(result.actions)

  return result
}

/**
 * Builds errorMessages from validation response actions.
 * @param {ValidationAction[]} actions - The actions array from validation response
 * @returns {ErrorItem[]} - errorMessages array
 */
function buildErrorMessagesFromResponse(actions = []) {
  const errorMessages = []
  for (const action of actions) {
    if (action.hasPassed) {
      continue
    }
    for (const rule of action.rules || []) {
      if (!rule.passed) {
        errorMessages.push({
          code: action.actionCode,
          description: rule.reason,
          sheetId: action.sheetId,
          parcelId: action.parcelId,
          passed: false
        })
      }
    }
  }
  return errorMessages
}

/**
 * @import { ActionOption, ActionGroup, ActionGroupDefinition, Parcel, ValidateApplicationResponse, ValidationAction, ErrorItem, Size } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
