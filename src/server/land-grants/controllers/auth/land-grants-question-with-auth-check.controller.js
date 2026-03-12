import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log, debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { getCachedAuthParcels, setCachedAuthParcels } from '~/src/server/land-grants/services/parcel-cache.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'

export default class LandGrantsQuestionWithAuthCheckController extends QuestionPageController {
  resolveParcelId(request, context) {
    return request.query?.parcelId || request.payload?.selectedLandParcel || context.state?.selectedLandParcel || null
  }

  makeGetRouteHandler() {
    return async (request, context, h) => {
      const parcelId = this.resolveParcelId(request, context)
      const unauthorised = await this.performAuthCheck(request, h, parcelId)
      if (unauthorised) {
        return unauthorised
      }
      return this.handleGet(request, context, h)
    }
  }

  makePostRouteHandler() {
    return async (request, context, h) => {
      const parcelId = this.resolveParcelId(request, context)
      const unauthorised = await this.performAuthCheck(request, h, parcelId)
      if (unauthorised) {
        return unauthorised
      }
      return this.handlePost(request, context, h)
    }
  }

  handleGet(request, context, h) {
    return super.makeGetRouteHandler()(request, context, h)
  }

  handlePost(request, context, h) {
    return super.makePostRouteHandler()(request, context, h)
  }

  performAuthCheck = async (request, h, landParcel) => {
    if (!landParcel) {
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

      if (!landParcelsForSbi.includes(landParcel)) {
        log(
          LogCodes.LAND_GRANTS.UNAUTHORISED_PARCEL,
          {
            sbi,
            selectedLandParcel: landParcel,
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
          errorMessage: `fetch parcel data for auth check: ${error.message}`
        },
        request
      )
      return this.renderUnauthorisedView(h)
    }

    return null
  }

  renderUnauthorisedView = (h) => {
    return h.response(h.view('unauthorised')).code(statusCodes.forbidden)
  }
}
