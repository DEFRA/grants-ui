import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'

export default class ConfirmationPageController extends StatusPageController {
  viewName = 'confirmation'

  /**
   * This method is called when there is a GET request to the confirmation page.
   * The method then uses the `h.view` method to render the page using the
   * view name and the view model.
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the score page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    const fn = async (request, context, h) => {
      const { collection, viewName } = this

      const viewModel = {
        ...super.getViewModel(request, context),
        errors: collection.getErrors(collection.getErrors()),
        referenceNumber: context.referenceNumber
      }
      return h.view(viewName, viewModel)
    }

    return fn
  }

  /**
   * Gets the path to the status page (in this case /confirmation page) for the GET handler.
   * @returns {string} path to the status page
   */
  getStatusPath() {
    return '/confirmation'
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
