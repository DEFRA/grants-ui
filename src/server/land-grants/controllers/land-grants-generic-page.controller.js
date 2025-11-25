import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

export default class LandGrantsGenericPageController extends QuestionPageController {
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const viewName = request.params.path

      const baseViewModel = super.getViewModel(request, context)

      return h.view(viewName, { ...baseViewModel, backLink: null })
    }
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
