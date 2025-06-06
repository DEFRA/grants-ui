import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'

export default class LandActionsCheckPageController extends QuestionPageController {
  viewName = 'land-actions-check'

  /**
   * This method is called when there is a POST request on the check selected land actions page.
   * It gets the land parcel id and redirects to the next step in the journey.
   */
  makePostRouteHandler() {
    /**
     * Handle POST requests to the page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<import('@hapi/boom').Boom<any> | import('@hapi/hapi').ResponseObject>}
     */
    const fn = (request, context, h) => {
      const { state } = context
      const payload = request.payload ?? {}
      const { addMoreActions } = payload

      if (!addMoreActions) {
        return h.view(this.viewName, {
          ...this.getViewModel(request, context),
          ...state,
          errors: ['Please select an option']
        })
      }

      const nextPath =
        addMoreActions === 'true'
          ? '/select-land-parcel'
          : this.getNextPath(context)
      return this.proceed(request, h, nextPath)
    }

    return fn
  }

  /**
   * This method is called when there is a GET request to the check selected land actions page.
   * It gets the view model for the page and adds business details
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     */
    const fn = (request, context, h) => {
      const { collection, viewName } = this
      const { state } = context

      // Build the view model exactly as in the original code
      const viewModel = {
        ...this.getViewModel(request, context),
        ...state,
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
