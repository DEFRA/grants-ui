import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'

export default class ConfirmationPageController extends StatusPageController {
  viewName = 'confirmation-page'

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
      if (request?.params?.slug && !context.state.formSlug) {
        context.state.formSlug = request.params.slug
        request.logger.debug(
          'Storing slug in context (GET):',
          request.params.slug
        )
      }

      // Get cache service
      const cacheService = getFormsCacheService(request.server)
      const confirmationState = await cacheService.getConfirmationState(request)

      // As we're using our custom controller but we want to be as close as DXT implementation as possible,
      // we check confirmation state to redirect to start path
      if (!confirmationState.confirmed) {
        return this.proceed(request, h, this.getStartPath())
      } else {
        await cacheService.setConfirmationState(request, { confirmed: false })
        await cacheService.clearState(request)
      }

      const viewModel = {
        ...super.getViewModel(request, context),
        errors: collection.getErrors(collection.getErrors()),
        referenceNumber: context.referenceNumber
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
    // First try to get slug from request params (available during initial page render)
    let slug = request?.params?.slug

    // Next try to get it from context state (available during form submission)
    if (!slug && context?.state?.formSlug) {
      slug = context.state.formSlug
      request?.logger?.debug(
        'ConfirmationController: Using slug from context.state.formSlug:',
        slug
      )
    }

    if (slug) {
      request?.logger?.debug('ConfirmationController: Using slug:', slug)
      return `/${slug}/confirmation`
    }

    request?.logger?.debug(
      'ConfirmationController: No slug found, using default path'
    )
    return '/confirmation'
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
