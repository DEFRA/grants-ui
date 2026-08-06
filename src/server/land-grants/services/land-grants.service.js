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
  parcelsWithActions,
  parcelsWithGroups,
  parcelsWithSize,
  validate
} from '~/src/server/land-grants/services/land-grants.client.js'
import { formatAreaUnit } from '~/src/shared/format-area-unit.js'
import {
  getCachedParcel,
  getCachedSbiParcels,
  setCachedParcel,
  setCachedSbiParcels
} from '~/src/server/land-grants/services/parcel-cache.js'

const LAND_GRANTS_API_URL = config.get('landGrants.grantsServiceApiEndpoint')

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
 * @param {ActionOption[]} actionsInGroup
 * @returns {ActionGroup}- Parcel data with actions
 */
const createGroup = (name, actionsInGroup) => ({
  name,
  totalAvailableArea: {
    unitFullName: formatAreaUnit(actionsInGroup[0]?.availableArea.unit),
    unit: actionsInGroup[0]?.availableArea.unit,
    value: Math.max(...actionsInGroup.map((item) => item.availableArea.value))
  },
  actions: actionsInGroup,
  consents: getConsentTypes()
    .filter((ct) => actionsInGroup.some((a) => /** @type {Record<string, unknown>} */ (a)[ct.apiField]))
    .map((ct) => ct.key)
})

/**
 * Shared fetch+cache logic behind fetchGroupedActionsForParcel (grouped)
 * and fetchActionsForParcel (flat). cacheKeyPrefix keeps their cache entries
 * from colliding.
 * @template T
 * @param {{ parcelId?: string, sheetId?: string, enabledLandActions?: string[], plannedActions?: PlannedAction[] }} parcel
 * @param {LandGrantsUserContext} userContext
 * @param {string} cacheKeyPrefix
 * @param {(parcelIds: string[], baseUrl: string, userContext: LandGrantsUserContext, plannedActions: PlannedAction[]) => Promise<ParcelResponse>} fetchParcelsWithFields
 * @param {(actionsForParcel: ActionOption[], enabledActions: string[], groupDefinitions: ActionGroupDefinition[]) => T} transformActions
 * @returns {Promise<{actions: T, parcel: {parcelId: string, sheetId: string, size: Size}}>}
 * @throws {Error}
 */
async function fetchParcelActions(
  { parcelId = '', sheetId = '', enabledLandActions = [], plannedActions = [] },
  userContext,
  cacheKeyPrefix,
  fetchParcelsWithFields,
  transformActions
) {
  const parcelKey = stringifyParcel({ sheetId, parcelId })
  const enabledActions = normaliseEnabledLandActions(enabledLandActions)
  const cacheKey = buildParcelActionsCacheKey(`${cacheKeyPrefix}${parcelKey}`, enabledActions)
  const cached = plannedActions.length === 0 ? getCachedParcel(cacheKey) : null

  if (cached) {
    return cached
  }

  const parcelIds = [parcelKey]
  const { parcels, groups: groupDefinitions = [] } = await fetchParcelsWithFields(
    parcelIds,
    LAND_GRANTS_API_URL,
    userContext,
    plannedActions
  )
  const foundParcel = parcels?.find((p) => p.parcelId === parcelId && p.sheetId === sheetId)
  const actionsForParcel = foundParcel?.actions?.map(mapAction) || []

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
    actions: transformActions(actionsForParcel, enabledActions, groupDefinitions)
  }

  if (plannedActions.length === 0) {
    setCachedParcel(cacheKey, result)
  }
  return result
}

/**
 * @param {ActionOption[]} actionsForParcel
 * @param {string[]} enabledActions
 * @param {ActionGroupDefinition[]} groupDefinitions
 * @returns {ActionGroup[]}
 */
function groupActions(actionsForParcel, enabledActions, groupDefinitions) {
  /** @type {ActionGroup[]} */
  const groups = []
  groupDefinitions.forEach((group) => {
    const actionsInGroup = actionsForParcel.filter(
      (a) => enabledActions.includes(a.code) && group.actions.includes(a.code)
    )
    if (actionsInGroup.length > 0) {
      groups.push(createGroup(group.name, actionsInGroup))
    }
  })
  return groups
}

/**
 * Fetches available actions for a given parcel, grouped. When plannedActions
 * is given, each action's availableArea is recomputed against that
 * combination and the cache is bypassed.
 * @param {{ parcelId?: string, sheetId?: string, enabledLandActions?: string[], plannedActions?: PlannedAction[] }} parcel
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{actions: ActionGroup[], parcel: {parcelId: string, sheetId: string, size: Size}}>}
 * @throws {Error}
 */
export async function fetchGroupedActionsForParcel(parcel, userContext) {
  return fetchParcelActions(parcel, userContext, '', parcelsWithGroups, groupActions)
}

/**
 * Same as fetchGroupedActionsForParcel, but returns a flat action list
 * with no grouping step.
 * @param {{ parcelId?: string, sheetId?: string, enabledLandActions?: string[], plannedActions?: PlannedAction[] }} parcel
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{actions: ActionOption[], parcel: {parcelId: string, sheetId: string, size: Size}}>}
 * @throws {Error}
 */
export async function fetchActionsForParcel(parcel, userContext) {
  return fetchParcelActions(parcel, userContext, 'flat:', parcelsWithActions, (actionsForParcel, enabledActions) =>
    actionsForParcel.filter((a) => enabledActions.includes(a.code))
  )
}

/**
 * Recomputes availableArea for a parcel's actions against an in-progress
 * selection, for the select-actions page's live availability refresh.
 * availability.type is static per action (not affected by the recompute),
 * so it isn't returned here - the client already has it from initial render.
 * @param {{ parcelId: string, sheetId: string, plannedActions: PlannedAction[] }} params
 * @param {LandGrantsUserContext} userContext
 * @returns {Promise<{ actions: Array<{ code: string, availableArea?: Size }> }>}
 * @throws {Error}
 */
export async function fetchActionsWithPlannedActions({ parcelId, sheetId, plannedActions }, userContext) {
  const parcelKey = stringifyParcel({ sheetId, parcelId })
  const { parcels } = await parcelsWithActions([parcelKey], LAND_GRANTS_API_URL, userContext, plannedActions)
  const foundParcel = parcels?.find((p) => p.parcelId === parcelId && p.sheetId === sheetId)
  const actions = (foundParcel?.actions || []).map(mapAction).map((action) => ({
    code: action.code,
    availableArea: action.availableArea
  }))

  return { actions }
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
 * @import { ActionOption, ActionGroup, ActionGroupDefinition, HydratedParcel, PlannedAction, ValidateApplicationResponse, ValidationAction, ErrorItem, Size, ParcelResponse } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { LandParcels } from '~/src/server/land-grants/types/form-state.d.js'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { LandGrantsUserContext } from './land-grants-user-context.js'
 */
