import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { landActionWithCode } from '~/src/server/land-grants/utils/land-action-with-code.js'
import { stringifyParcel } from '~/src/shared/format-parcel.js'
import { stateToLandActionsMapper } from '../mappers/state-to-land-grants-mapper.js'
import { config } from '~/src/config/config.js'
import { getConsentTypes } from '~/src/server/land-grants/utils/consent-types.js'
import {
  calculate,
  locateParcelTiles,
  parcelsGroups,
  parcelsWithExtendedInfo,
  parcelsWithSize,
  validate
} from '~/src/server/land-grants/services/land-grants.client.js'
import { formatAreaUnit } from '~/src/shared/format-area-unit.js'
import {
  getCachedParcel,
  setCachedParcel,
  getCachedSbiParcels,
  setCachedSbiParcels
} from '~/src/server/land-grants/services/parcel-cache.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')
const QUANTITY_REQUIRED_ACTION_CODES = config.get('landGrants.quantityRequiredActionCodes')

/**
 * @param {unknown} enabledLandActions
 * @returns {string[]}
 */
const normaliseEnabledLandActions = (enabledLandActions = []) =>
  Array.isArray(enabledLandActions)
    ? enabledLandActions
        .filter((action) => typeof action === 'string')
        .map((action) => action.trim())
        .filter(Boolean)
    : []

/**
 * @param {string} parcelKey
 * @param {string[]} enabledLandActions
 * @returns {string}
 */
const buildParcelActionsCacheKey = (parcelKey, enabledLandActions) =>
  `${parcelKey}:${[...enabledLandActions].sort((a, b) => a.localeCompare(b)).join(',')}`

/**
 * Calculates grant payment for land actions.
 * @param {object} state
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{payment: PaymentCalculation, errorMessage?: string, paymentTotal: string}>} - Payment calculation result
 * @throws {Error}
 */
export async function calculateLandActionsPayment(state, userContext) {
  const payload = {
    parcel: stateToLandActionsMapper(state)
  }
  const { payment } = await calculate(payload, LAND_GRANTS_API_URL, userContext)
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
    .filter((ct) => groupActions.some((a) => /** @type {Record<string, unknown>} */ (a)[ct.apiField]))
    .map((ct) => ct.key)
})

/**
 * Fetches available actions for a given parcel. When plannedActions is given,
 * each action's availableArea is recomputed against that combination and the
 * cache is bypassed (the cache key isn't keyed on plannedActions).
 * @param {{ parcelId?: string, sheetId?: string, enabledLandActions?: string[], plannedActions?: PlannedAction[] }} parcel
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{actions: ActionGroup[], parcel: {parcelId: string, sheetId: string, size: Size}}>}- Parcel data with actions
 * @throws {Error}
 */
export async function fetchAvailableActionsForParcel(
  { parcelId = '', sheetId = '', enabledLandActions = [], plannedActions = [] },
  userContext
) {
  const parcelKey = stringifyParcel({ sheetId, parcelId })
  const enabledActions = normaliseEnabledLandActions(enabledLandActions)
  const cacheKey = buildParcelActionsCacheKey(parcelKey, enabledActions)
  const cached = plannedActions.length === 0 ? getCachedParcel(cacheKey) : null

  if (cached) {
    return cached
  }

  /** @type {ActionGroup[]} */
  const actions = []
  const parcelIds = [parcelKey]
  const { parcels, groups: groupDefinitions = [] } = await parcelsWithExtendedInfo(
    parcelIds,
    LAND_GRANTS_API_URL,
    userContext,
    plannedActions
  )
  const foundParcel = parcels?.find((p) => p.parcelId === parcelId && p.sheetId === sheetId)
  const actionsForParcel = foundParcel?.actions?.map(mapAction) || []

  groupDefinitions.forEach((group) => {
    const groupActions = actionsForParcel.filter((a) => {
      if (!enabledActions.includes(a.code)) {
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

  if (plannedActions.length === 0) {
    setCachedParcel(cacheKey, result)
  }
  return result
}

/**
 * Recomputes availableArea for a parcel's actions against an in-progress
 * selection, for the select-actions page's live availability refresh.
 * @param {{ parcelId: string, sheetId: string, plannedActions: PlannedAction[] }} params
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{ actions: Array<{ code: string, availableArea?: Size, requiresMaxQuantity?: number }> }>}
 * @throws {Error}
 */
export async function fetchActionsWithPlannedActions({ parcelId, sheetId, plannedActions }, userContext) {
  const parcelKey = stringifyParcel({ sheetId, parcelId })
  const { parcels } = await parcelsWithExtendedInfo([parcelKey], LAND_GRANTS_API_URL, userContext, plannedActions)
  const foundParcel = parcels?.find((p) => p.parcelId === parcelId && p.sheetId === sheetId)
  const actions = (foundParcel?.actions || []).map(mapAction).map((action) => ({
    code: action.code,
    availableArea: action.availableArea,
    requiresMaxQuantity: action.requiresMaxQuantity
  }))

  return { actions }
}

/**
 *
 * @param {ActionOption} action
 */
function mapAction(action) {
  const requiresQuantity = QUANTITY_REQUIRED_ACTION_CODES.includes(action.code)
  return {
    ...action,
    description: landActionWithCode(action.description, action.code),
    // Once land-grants-api is ready we need to replace this with their actual max quantity field.
    // Falls back to 0 (not undefined) when availableArea is missing so a configured code always
    // still gets a quantity input - undefined here is read downstream as "not required at all".
    requiresMaxQuantity: requiresQuantity ? (action.availableArea?.value ?? 0) : undefined
  }
}

/**
 * Fetches parcel groups for a list of parcel IDs.
 * @param {object} state
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<ActionGroupDefinition[]>}
 * @throws {Error}
 */
export async function fetchParcelsGroups(state, userContext) {
  const { landParcels = {} } = /** @type {{ landParcels?: LandParcels }} */ (state)
  const parcelIds = Object.keys(landParcels) || []
  if (!parcelIds.length) {
    return []
  }

  const { groups = [] } = await parcelsGroups(parcelIds, LAND_GRANTS_API_URL, userContext)
  return groups
}

/**
 * Fetches parcel size for a list of parcel IDs.
 * @param {string[]} parcelIds
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<Record<string, Size | null>>}
 * @throws {Error}
 */
async function fetchParcelsSize(parcelIds, userContext) {
  const { parcels } = await parcelsWithSize(parcelIds, LAND_GRANTS_API_URL, userContext)

  return parcels.reduce((acc, p) => {
    acc[stringifyParcel(p)] = p.size
    return acc
  }, /** @type {Record<string, Size | null>} */ ({}))
}

/**
 * In-flight parcel loads keyed by SBI. Map tile requests arrive in parallel
 * bursts; without this, every request that misses the value cache would fire
 * its own DAL + size-API round trip. Entries remove themselves on settle, so
 * failures are never cached and the next call retries.
 * @type {Map<unknown, Promise<HydratedParcel[]>>}
 */
const inflightParcelsBySbi = new Map()

/**
 * Fetches parcels with area data for a given SBI. Concurrent calls for the
 * same SBI share a single upstream load.
 * @param {AnyFormRequest} request
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<HydratedParcel[]>}
 * @throws {Error}
 */
export async function fetchParcels(request, userContext) {
  const sbi = request.auth?.credentials?.sbi
  const cached = getCachedSbiParcels(sbi)

  if (cached) {
    return cached
  }

  let inflight = inflightParcelsBySbi.get(sbi)
  if (!inflight) {
    inflight = loadParcelsForSbi(request, sbi, userContext).finally(() => inflightParcelsBySbi.delete(sbi))
    inflightParcelsBySbi.set(sbi, inflight)
  }
  return inflight
}

/**
 * @param {AnyFormRequest} request
 * @param {unknown} sbi
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<HydratedParcel[]>}
 */
async function loadParcelsForSbi(request, sbi, userContext) {
  const parcels = await fetchParcelsFromDal(request)
  const parcelKeys = parcels.map(stringifyParcel)
  const sizes = await fetchParcelsSize(parcelKeys, userContext)
  const hydratedParcels = parcels.map((p) => ({
    ...p,
    area: sizes[stringifyParcel(p)] || {}
  }))

  setCachedSbiParcels(sbi, hydratedParcels)
  return hydratedParcels
}

/**
 * Fetches the bounding box covering a set of parcel IDs from the tile API.
 * Used by the map controller to fit the viewport on load.
 * Returns null on any error so callers can degrade gracefully.
 * @param {string[]} parcelIds
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{minLng: number, minLat: number, maxLng: number, maxLat: number} | null>}
 */
export async function fetchParcelTileLocation(parcelIds, userContext) {
  try {
    const result = await locateParcelTiles(parcelIds, LAND_GRANTS_API_URL, userContext)
    return result.bbox
  } catch {
    return null
  }
}

/**
 * Validates the application
 * @param {object} data
 * @param {string} data.applicationId
 * @param {string} data.crn
 * @param {object} data.state
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<ValidateApplicationResponse>}
 * @throws {Error}
 */
export async function validateApplication(data, userContext) {
  const { applicationId, crn, state } = data

  const payload = {
    applicationId: applicationId?.toLowerCase(),
    requester: 'grants-ui',
    applicantCrn: crn,
    landActions: stateToLandActionsMapper(state)
  }

  const result = await validate(payload, LAND_GRANTS_API_URL, userContext)
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
 * @import { ActionOption, ActionGroup, ActionGroupDefinition, Parcel, HydratedParcel, PlannedAction, ValidateApplicationResponse, ValidationAction, ErrorItem, Size } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { LandParcels } from '~/src/server/land-grants/types/form-state.d.js'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { LandGrantsUserContext } from './land-grants-user-context.js'
 */
