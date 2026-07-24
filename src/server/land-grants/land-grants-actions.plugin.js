import Joi from 'joi'
import { error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { fetchAuthorisedParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'
import { fetchActionsWithPlannedActions } from '~/src/server/land-grants/services/land-grants.service.js'
import { COMPOUND_PARCEL_ID_PATTERN, parseLandParcel } from '~/src/shared/format-parcel.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'

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
          unit: Joi.string().valid('ha', 'sqm').required()
        })
      )
      .required()
  })
}

/**
 * Live action-availability refresh for the select-actions page. Given the
 * user's in-progress selection (plannedActions), recomputes each action's
 * availableArea so the client can grey out actions that are no longer
 * available with that combination, without a full page reload.
 * @param {Request} request
 * @param {ResponseToolkit} h
 */
async function actionsHandler(request, h) {
  const { parcelId: compoundParcelId } = request.params
  const { plannedActions } = /** @type {{ plannedActions: PlannedAction[] }} */ (request.payload)

  const authorisedParcelIds = await fetchAuthorisedParcelIds(
    /** @type {AnyFormRequest} */ (/** @type {unknown} */ (request))
  )
  if (!authorisedParcelIds?.includes(compoundParcelId)) {
    return h.response().code(statusCodes.forbidden)
  }

  const [sheetId, parcelId] = parseLandParcel(compoundParcelId)

  try {
    const userContext = getLandGrantsUserContext(/** @type {AnyFormRequest} */ (/** @type {unknown} */ (request)))
    const result = await fetchActionsWithPlannedActions({ parcelId, sheetId, plannedActions }, userContext)
    return h.response(result).code(statusCodes.ok)
  } catch (err) {
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
    }
  }
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { PlannedAction } from '~/src/server/land-grants/types/land-grants.client.d.js'
 */
