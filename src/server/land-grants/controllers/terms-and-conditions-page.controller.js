import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

export default class TermsAndConditionsPageController extends QuestionPageController {
  viewName = 'terms-and-conditions'

  makeGetRouteHandler() {
    return async (request, context, h) => {
      const baseViewModel = super.getViewModel(request, context)

      return h.view(this.viewName, { ...baseViewModel, backLink: undefined })
    }
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
