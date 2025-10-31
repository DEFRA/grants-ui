import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { fetchParcels } from '~/src/server/land-grants/services/land-grants.service.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'

export default class LandGrantsQuestionWithAuthCheckController extends QuestionPageController {
  landParcelsForSbi = []
  selectedLandParcel = ''

  landParcelBelongsToSbi = () => {
    return this.landParcelsForSbi.includes(this.selectedLandParcel)
  }

  performAuthCheck = async (request, h) => {
    try {
      const landParcels = (await fetchParcels(request)) || []
      this.landParcelsForSbi = landParcels.map((parcel) => stringifyParcel(parcel))

      if (!this.landParcelBelongsToSbi()) {
        return this.renderUnauthorisedView(h)
      }
    } catch (error) {
      log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
        endpoint: `Land grants API`,
        error: `fetch parcel data for auth check: ${error.message}`
      })
      return this.renderUnauthorisedView(h)
    }

    return null
  }

  renderUnauthorisedView = (h) => {
    return h.response(h.view('unauthorised')).code(statusCodes.forbidden)
  }
}
