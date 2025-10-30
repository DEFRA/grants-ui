import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { fetchParcels } from '~/src/server/land-grants/services/land-grants.service.js'
import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'

export default class LandGrantsQuestionWithAuthCheckController extends QuestionPageController {
  landParcelsForSbi = []
  selectedLandParcel = ''

  landParcelBelongsToSbi = () => {
    return this.landParcelsForSbi.includes(this.selectedLandParcel)
  }

  performAuthCheck = async (request, h) => {
    let landParcels = []
    try {
      landParcels = (await fetchParcels(request)) || []
    } catch (error) {
      request.logger.error({ err: error }, 'Unexpected error when fetching parcel data for auth check')
    }
    this.landParcelsForSbi = landParcels.map((parcel) => stringifyParcel(parcel))

    if (!this.landParcelBelongsToSbi()) {
      return this.renderUnauthorisedView(h)
    }
    return null
  }

  renderUnauthorisedView = (h) => {
    return h.response(h.view('unauthorised')).code(statusCodes.forbidden)
  }
}
