import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'

export default class ConsentPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'consent-required'

  /**
   * Handle GET requests to the page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const { viewName } = this
      const {
        state: { requiredConsents }
      } = context
      const baseViewModel = super.getViewModel(request, context)

      if (!requiredConsents || requiredConsents.length === 0) {
        return this.proceed(request, h, '/check-selected-land-actions')
      }

      return h.view(viewName, {
        ...baseViewModel,
        requiredConsents
      })
    }
  }

  /**
   * Handle POST requests to the page
   */
  makePostRouteHandler() {
    /**
     * Handle POST requests to the consent page.
     * @param {AnyFormRequest} request
     * @param {FormContext} _context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, _context, h) => {
      return this.proceed(request, h, '/submit-your-application')
    }

    return fn
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
