import Joi from 'joi'
import { error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { fetchAuthorisedParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'
import {
  fetchActionsWithPlannedActions,
  fetchConsentRequirementsForParcel
} from '~/src/server/land-grants/services/land-grants.service.js'
import { COMPOUND_PARCEL_ID_PATTERN, parseLandParcel } from '~/src/shared/format-parcel.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
import { UNIT_TYPES } from '~/src/shared/unit-types.js'

const compoundParcelParams = Joi.object({
  parcelId: Joi.string().pattern(COMPOUND_PARCEL_ID_PATTERN).required()
})

const plannedActionsValidation = {
  params: compoundParcelParams,
  payload: Joi.object({
    plannedActions: Joi.array()
      .items(
        Joi.object({
          actionCode: Joi.string().required(),
          quantity: Joi.number().required(),
          unit: Joi.string()
            .valid(...UNIT_TYPES)
            .required()
        })
      )
      .required()
  })
}

const consentsValidation = {
  params: compoundParcelParams,
  // The journey's rendered action codes, used only to narrow which of the
  // parcel's actions count towards the requirement - never as authorisation.
  // An empty array is valid and means no action can contribute one.
  payload: Joi.object({
    enabledLandActions: Joi.array().items(Joi.string()).unique().required()
  })
}

/**
 * The parcel a request is allowed to act on, or null when the caller is not
 * authorised for it - including when the authorisation lookup itself failed,
 * which must not be treated as "allowed".
 * @param {Request} request
 * @returns {Promise<{ formRequest: AnyFormRequest, sheetId: string, parcelId: string } | null>}
 */
async function resolveAuthorisedParcel(request) {
  const formRequest = /** @type {AnyFormRequest} */ (/** @type {unknown} */ (request))
  const { parcelId: compoundParcelId } = request.params

  const authorisedParcelIds = await fetchAuthorisedParcelIds(formRequest)
  if (!authorisedParcelIds?.includes(compoundParcelId)) {
    return null
  }

  const [sheetId, parcelId] = parseLandParcel(compoundParcelId)
  return { formRequest, sheetId, parcelId }
}

/**
 * Logs an upstream failure and maps it to a response status.
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @param {unknown} err
 * @param {{ sheetId: string, parcelId: string }} parcel
 */
function upstreamErrorResponse(request, h, err, { sheetId, parcelId }) {
  const { sbi } = request.auth.credentials
  const { message: errorMessage, status: upstreamStatus } = /** @type {Error & {status?: number}} */ (err)
  error(
    LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR,
    { sbi, sheetId, parcelId, errorMessage, statusCode: upstreamStatus },
    request
  )
  // A 4xx means the upstream rejected the request as invalid, not an
  // outage - pass the real status through rather than masking it as a 503.
  const isUpstreamClientError =
    typeof upstreamStatus === 'number' &&
    upstreamStatus >= statusCodes.badRequest &&
    upstreamStatus < statusCodes.internalServerError
  return h.response().code(isUpstreamClientError ? upstreamStatus : statusCodes.serviceUnavailable)
}

/**
 * Live action-availability refresh for the select-actions page. Given the
 * user's in-progress selection (plannedActions), recomputes each action's
 * availability so the client can grey out actions that are no longer
 * available with that combination, without a full page reload.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function actionsHandler(request, h) {
  const authorisedParcel = await resolveAuthorisedParcel(request)
  if (!authorisedParcel) {
    return h.response().code(statusCodes.forbidden)
  }

  const { formRequest, sheetId, parcelId } = authorisedParcel
  const { plannedActions } = /** @type {{ plannedActions: PlannedAction[] }} */ (request.payload)

  try {
    const userContext = getLandGrantsUserContext(formRequest)
    const result = await fetchActionsWithPlannedActions({ parcelId, sheetId, plannedActions }, userContext)
    return h.response(result).code(statusCodes.ok)
  } catch (err) {
    return upstreamErrorResponse(request, h, err, { sheetId, parcelId })
  }
}

/**
 * The consent requirements that apply to one parcel, for the map page's
 * "Additional details" row. The parcel load itself carries no parcel-level
 * designation flags, so they are derived from the parcel's journey-enabled
 * actions after selection.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function consentsHandler(request, h) {
  const authorisedParcel = await resolveAuthorisedParcel(request)
  if (!authorisedParcel) {
    return h.response().code(statusCodes.forbidden)
  }

  const { formRequest, sheetId, parcelId } = authorisedParcel
  const { enabledLandActions } = /** @type {{ enabledLandActions: string[] }} */ (request.payload)

  try {
    const userContext = getLandGrantsUserContext(formRequest)
    const result = await fetchConsentRequirementsForParcel({ parcelId, sheetId, enabledLandActions }, userContext)
    return h.response(result).code(statusCodes.ok)
  } catch (err) {
    return upstreamErrorResponse(request, h, err, { sheetId, parcelId })
  }
}

export const landGrantsActionsPlugin = {
  plugin: {
    name: 'land-grants-actions',
    register(server) {
      server.route({
        method: 'POST',
        path: '/api/land-grants/actions/{parcelId}',
        options: {
          auth: { mode: 'required', strategy: 'session' },
          validate: plannedActionsValidation,
          plugins: { crumb: { restful: true } }
        },
        handler: actionsHandler
      })

      server.route({
        method: 'POST',
        path: '/api/land-grants/actions/{parcelId}/consents',
        options: {
          auth: { mode: 'required', strategy: 'session' },
          validate: consentsValidation,
          plugins: { crumb: { restful: true } }
        },
        handler: consentsHandler
      })
    }
  }
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { PlannedAction } from '~/src/server/land-grants/types/land-grants.client.d.js'
 */
