import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

export default class LandParcelController extends QuestionPageController {
  viewName = 'select-land-parcel'

  /**
   * This method is called when there is a GET request to the select land parcel page.
   * It gets the view model for the page using the `getViewModel` method,
   * and then adds business details to the view model
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the land parcel page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     */
    const fn = (request, context, h) => {
      const { collection, viewName } = this

      const viewModel = {
        ...super.getViewModel(request, context),
        errors: collection.getErrors(collection.getErrors())
      }

      return h.view(viewName, viewModel)
    }

    return fn
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
