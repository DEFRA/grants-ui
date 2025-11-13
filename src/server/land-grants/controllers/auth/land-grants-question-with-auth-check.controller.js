import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'

export default class LandGrantsQuestionWithAuthCheckController extends QuestionPageController {
  performAuthCheck = async (request, h, landParcel) => {
    if (!landParcel) {
      return null
    }

    try {
      const landParcels = (await fetchParcelsFromDal(request)) || []
      const landParcelsForSbi = landParcels.map((parcel) => stringifyParcel(parcel))

      if (!landParcelsForSbi.includes(landParcel)) {
        const sbi = request.auth?.credentials?.sbi
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
      log(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        {
          endpoint: `Consolidated view`,
          error: `fetch parcel data for auth check: ${error.message}`
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
