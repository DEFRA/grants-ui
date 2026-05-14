import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { debug, log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { getCachedAuthParcels, setCachedAuthParcels } from '~/src/server/land-grants/services/parcel-cache.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'
import { withTaskContext } from '~/src/server/task-list/task-list.helper.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

export default class QuestionPageWithParcelCheckController extends withTaskContext(QuestionPageController) {
  /**
   * Subclasses override this to declare which parcel IDs the request requires
   * authorisation for. Return `null` to skip the auth check entirely.
   * @param {AnyFormRequest} _request
   * @returns {string[] | null}
   */
  resolveParcelIds(_request) {
    throw new SystemError({
      message: `${this.constructor.name} must implement resolveParcelIds()`,
      source: 'resolveParcelIds',
      reason: 'not_implemented'
    })
  }

  makeGetRouteHandler() {
    /**
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {ResponseToolkit} h
     */
    return async (request, context, h) => {
      const parcelIds = this.resolveParcelIds(request)
      const unauthorised = await this.performAuthCheck(request, h, parcelIds)

      if (unauthorised) {
        return unauthorised
      }
      return this.handleGet(request, context, h)
    }
  }

  makePostRouteHandler() {
    /**
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {ResponseToolkit} h
     */
    return async (request, context, h) => {
      const parcelIds = this.resolveParcelIds(request)
      const unauthorised = await this.performAuthCheck(request, h, parcelIds)
      if (unauthorised) {
        return unauthorised
      }
      return this.handlePost(request, context, h)
    }
  }

  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {ResponseToolkit} h
   */
  handleGet(request, context, h) {
    return super.makeGetRouteHandler()(request, context, h)
  }

  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {ResponseToolkit} h
   */
  handlePost(request, context, h) {
    return super.makePostRouteHandler()(request, context, h)
  }

  /**
   * Verify each requested parcel ID is in the SBI's authorised set; render the
   * unauthorised view (and return it) if any parcel is unknown, else `null`.
   * @param {AnyFormRequest} request
   * @param {ResponseToolkit} h
   * @param {string[] | null} parcelIds
   * @returns {Promise<ResponseObject | null>}
   */
  performAuthCheck = async (request, h, parcelIds) => {
    if (parcelIds !== null && !Array.isArray(parcelIds)) {
      throw new SystemError({
        message: `${this.constructor.name}.resolveParcelIds() must return an array or null`,
        source: 'performAuthCheck',
        reason: 'invalid_return_type'
      })
    }

    if (!parcelIds || parcelIds.length === 0) {
      return null
    }

    const sbi = request.auth?.credentials?.sbi

    try {
      let landParcelsForSbi = getCachedAuthParcels(sbi)

      if (!landParcelsForSbi) {
        const landParcels = (await fetchParcelsFromDal(request)) || []
        landParcelsForSbi = landParcels.map((parcel) => stringifyParcel(parcel))
        setCachedAuthParcels(sbi, landParcelsForSbi)
      }

      const unauthorisedParcel = parcelIds.find((id) => !landParcelsForSbi.includes(id))

      if (unauthorisedParcel) {
        log(
          LogCodes.LAND_GRANTS.UNAUTHORISED_PARCEL,
          {
            sbi,
            selectedLandParcel: unauthorisedParcel,
            landParcelsForSbi
          },
          request
        )
        return this.renderUnauthorisedView(h)
      }
    } catch (error) {
      debug(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        {
          endpoint: `Consolidated view`,
          errorMessage: `fetch parcel data for auth check: ${/** @type {Error} */ (error).message}`
        },
        request
      )
      return this.renderUnauthorisedView(h)
    }

    return null
  }

  /**
   * @param {ResponseToolkit} h
   * @returns {ResponseObject}
   */
  renderUnauthorisedView = (h) => {
    return h.response(h.view('unauthorised')).code(statusCodes.forbidden)
  }
}

/**
 * @import { AnyFormRequest, FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
