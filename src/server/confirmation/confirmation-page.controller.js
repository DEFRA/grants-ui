import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import { getConfirmationPath, storeSlugInContext } from '~/src/server/common/helpers/form-slug-helper.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'

export default class ConfirmationPageController extends StatusPageController {
  viewName = 'confirmation-page.html' // this page does not exist so marking this for future removal

  /**
   * @param {FormModel} model
   * @param {PageStatus} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
  }

  /**
   * This method is called when there is a GET request to the confirmation page.
   * The method then uses the `h.view` method to render the page using the
   * view name and the view model.
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the score page.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     */
    return async (request, context, h) => {
      storeSlugInContext(request, context, 'ConfirmationController')

      const cacheService = getFormsCacheService(request.server)
      const state = await cacheService.getState(request)
      const referenceNumber = state.$$__referenceNumber

      return this.renderConfirmationPage(request, context, h, referenceNumber)
    }
  }

  /**
   * Render the confirmation page
   * @param {AnyFormRequest} request - The request object
   * @param {FormContext} context - The context object
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h - Response toolkit
   * @param {string} referenceNumber - The reference number
   * @returns {ResponseObject} View response
   */
  renderConfirmationPage(request, context, h, referenceNumber) {
    /** @type {object} */
    const { collection } = this
    // @ts-ignore - super not being recognised as QuestionPageController as it is two levels above and it's on a node module
    const baseViewModel = super.getViewModel(request, context)
    const viewModel = {
      ...baseViewModel,
      errors: collection.getErrors(collection.getErrors()),
      referenceNumber,
      businessName: request.yar?.get('businessName'),
      sbi: request.yar?.get('sbi'),
      contactName: request.yar?.get('contactName')
    }

    return h.view(this.viewName, viewModel)
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
    // @ts-ignore - super not being recognised as QuestionPageController as it is two levels above and it's on a node module
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
 * @import { type FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, type ResponseToolkit } from '@hapi/hapi'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageStatus } from '@defra/forms-model'
 */
