import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { mapConsentPanelToViewModel } from '~/src/server/land-grants/view-models/consent.view-model.js'

export default class ConsentPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'consent-required'

  resolveParcelId(_request, _context) {
    return null
  }

  /**
   * Handle GET requests to the page
   */
  async handleGet(request, context, h) {
    const { viewName } = this
    const {
      state: { requiredConsents, landParcels }
    } = context
    const baseViewModel = super.getViewModel(request, context)

    if (!requiredConsents || requiredConsents.length === 0) {
      return this.proceed(request, h, '/check-selected-land-actions')
    }

    const actionCount = Object.values(landParcels || {}).reduce(
      (total, parcel) => total + Object.keys(parcel.actionsObj || {}).length,
      0
    )

    const consentPanel = mapConsentPanelToViewModel(requiredConsents)

    return h.view(viewName, {
      ...baseViewModel,
      consentPanel,
      actionCount
    })
  }

  /**
   * Handle POST requests to the page
   * @param {AnyFormRequest} request
   * @param {FormContext} _context
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
   * @returns {Promise<ResponseObject>}
   */
  async handlePost(request, _context, h) {
    return this.proceed(request, h, '/submit-your-application')
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
