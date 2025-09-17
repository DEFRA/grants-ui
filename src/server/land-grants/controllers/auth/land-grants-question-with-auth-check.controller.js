import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { fetchParcels } from '~/src/server/land-grants/services/land-grants.service.js'

export default class LandGrantsQuestionWithAuthCheckController extends QuestionPageController {
  landParcelsForSbi = []
  selectedLandParcel = ''

  landParcelBelongsToSbi = () => {
    return this.landParcelsForSbi.includes(this.selectedLandParcel)
  }

  performAuthCheck = async (request, h) => {
    const landParcels = (await fetchParcels(request.auth.credentials.sbi)) || []
    this.landParcelsForSbi = landParcels.map((parcel) => `${parcel.sheetId}-${parcel.parcelId}`)

    if (!this.landParcelBelongsToSbi()) {
      return this.renderUnauthorisedView(request, h)
    }
    return null
  }

  renderUnauthorisedView = (request, h) => {
    return h.response(h.view('unauthorised')).code(statusCodes.forbidden)
  }
}
