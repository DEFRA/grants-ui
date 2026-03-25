import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { mapConsentPanelToViewModel } from '~/src/server/land-grants/view-models/consent.view-model.js'
import { getRequiredConsents } from '~/src/server/common/utils/consents.js'

export default class ConsentPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'consent-required'

  resolveParcelIds(_request, _context) {
    return null
  }

  /**
   * Handle GET requests to the page
   */
  async handleGet(request, context, h) {
    const { viewName } = this
    const { state } = context
    const landParcels = state.landParcels || {}
    const baseViewModel = super.getViewModel(request, context)

    const requiredConsents = getRequiredConsents(state)
    if (requiredConsents.length === 0) {
      return this.proceed(request, h, this.getNextPath(context))
    }

    const actionCount = Object.values(landParcels).reduce(
      (total, parcel) =>
        total + Object.values(parcel.actionsObj || {}).filter((action) => action.consents?.length > 0).length,
      0
    )

    return h.view(viewName, {
      ...baseViewModel,
      consentPanel: mapConsentPanelToViewModel(requiredConsents),
      actionCount
    })
  }

  /**
   * Handle POST requests to the page
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
   * @returns {Promise<ResponseObject>}
   */
  async handlePost(request, context, h) {
    return this.proceed(request, h, this.getNextPath(context))
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
