import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import { getConfirmationPath, storeSlugInContext } from '~/src/server/common/helpers/form-slug-helper.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'

export default class ConfirmationPageController extends StatusPageController {
  viewName = 'confirmation-page.html'

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
    return async (request, context, h) => {
      const { collection, viewName } = this

      // Store the slug in context if it's available in request.params
      storeSlugInContext(request, context, 'ConfirmationController')

      const cacheService = getFormsCacheService(request.server)
      const state = await cacheService.getState(request)
      const referenceNumber = state.$$__referenceNumber

      // Log the confirmation state for debugging
      request.logger.debug('ConfirmationController: State:', state)
      request.logger.debug('ConfirmationController: Current path:', request.path)

      // Get and log the start path - pass request to getStartPath for logging
      const startPath = this.getStartPath()
      request.logger.debug('ConfirmationController: Start path:', startPath)

      if (state.applicationStatus === ApplicationStatus.SUBMITTED) {
        request.logger.info('ConfirmationController: Application submitted, showing confirmation page')
      }

      const viewModel = {
        ...super.getViewModel(request, context),
        errors: collection.getErrors(collection.getErrors()),
        referenceNumber
      }
      return h.view(viewName, viewModel)
    }
  }

  /**
   * Gets the path to the status page (in this case /confirmation page) for the GET handler.
   * @param {object} request - The request object containing the URL info
   * @param {object} [context] - The context object which may contain form state
   * @returns {string} path to the status page
   */
  getStatusPath(request, context) {
    return getConfirmationPath(request, context, 'ConfirmationController')
  }

  /**
   * Override to use the slug for getting the start path
   * @returns {string} The start path for the form
   */
  getStartPath() {
    // Use the model's default implementation
    const defaultPath = super.getStartPath()

    // Try to get the slug from the model if possible
    const slug = this.model?.def?.metadata?.slug
    if (slug) {
      return `/${slug}/start`
    }

    return defaultPath
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
