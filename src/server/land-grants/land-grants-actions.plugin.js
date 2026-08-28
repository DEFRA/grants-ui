import Joi from 'joi'
import { error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { fetchAuthorisedParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'
import {
  fetchActionsWithPlannedActions,
  fetchConsentRequirementsForParcel
} from '~/src/server/land-grants/services/land-grants.service.js'
import { getConsentNotice } from '~/src/server/land-grants/view-models/consent.view-model.js'
import { COMPOUND_PARCEL_ID_PATTERN, parseLandParcel } from '~/src/shared/format-parcel.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
import { UNIT_TYPES } from '~/src/shared/unit-types.js'

const plannedActionsValidation = {
  params: Joi.object({
    parcelId: Joi.string().pattern(COMPOUND_PARCEL_ID_PATTERN).required()
  }),
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

/**
 * Returns the parcel a request may act on, or null when the caller is not
 * authorised for it. A failed authorisation lookup counts as not authorised.
 * @param {Request} request
 * @returns {Promise<{ formRequest: AnyFormRequest, sheetId: string, parcelId: string } | null>}
 */
async function authorisedParcel(request) {
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
 * Logs an upstream failure and maps it to a status. A 4xx means the upstream
 * rejected the request as invalid rather than being unavailable, so that
 * status is passed through; anything else becomes a 503.
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @param {unknown} err
 * @param {{ sheetId: string, parcelId: string }} parcel
 */
function upstreamFailure(request, h, err, { sheetId, parcelId }) {
  const { sbi } = request.auth.credentials
  const { message: errorMessage, status: upstreamStatus } = /** @type {Error & {status?: number}} */ (err)
  error(
    LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR,
    { sbi, sheetId, parcelId, errorMessage, statusCode: upstreamStatus },
    request
  )
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
  const parcel = await authorisedParcel(request)
  if (!parcel) {
    return h.response().code(statusCodes.forbidden)
  }

  const { formRequest, sheetId, parcelId } = parcel
  const { plannedActions } = /** @type {{ plannedActions: PlannedAction[] }} */ (request.payload)

  try {
    const userContext = getLandGrantsUserContext(formRequest)
    const result = await fetchActionsWithPlannedActions({ parcelId, sheetId, plannedActions }, userContext)
    return h.response(result).code(statusCodes.ok)
  } catch (err) {
    return upstreamFailure(request, h, err, parcel)
  }
}

/**
 * The consent notice for one parcel, shown on the map page after selection.
 * It covers every action the parcel carries: an SSSI designation or HEFER
 * requirement belongs to the land rather than to the actions this grant
 * offers.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function consentsHandler(request, h) {
  const parcel = await authorisedParcel(request)
  if (!parcel) {
    return h.response().code(statusCodes.forbidden)
  }

  const { formRequest, sheetId, parcelId } = parcel

  try {
    const userContext = getLandGrantsUserContext(formRequest)
    const { consents } = await fetchConsentRequirementsForParcel({ parcelId, sheetId }, userContext)
    return h.response(getConsentNotice(consents)).code(statusCodes.ok)
  } catch (err) {
    return upstreamFailure(request, h, err, parcel)
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
          // No body: the parcel comes from the path, and the crumb from the header.
          validate: { params: Joi.object({ parcelId: Joi.string().pattern(COMPOUND_PARCEL_ID_PATTERN).required() }) },
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
