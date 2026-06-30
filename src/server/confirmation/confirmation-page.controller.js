import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import { getConfirmationPath, storeSlugInContext } from '~/src/server/common/helpers/form-slug-helper.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { ConfirmationService } from './services/confirmation.service.js'
import { isBoom } from '@hapi/boom'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { statusCodes } from '../common/constants/status-codes.js'

export default class ConfirmationPageController extends StatusPageController {
  viewName = 'confirmation-page.html'

  /**
   * @param {FormModel} model
   * @param {PageStatus} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
  }

  /**
   * Loads and validates confirmation content for the form
   * @param {AnyFormRequest} request - The request object
   * @param {FormSubmissionState} state - the DXT state object containing application details
   * @returns {Promise<ConfirmationContent | null>} Content result with confirmationContent and formDefinition
   */
  async loadConfirmationContent(request, state) {
    const form = this.model.def

    const { slug } = request.params

    const { confirmationContent } = await ConfirmationService.loadConfirmationContent(form)

    return confirmationContent ? ConfirmationService.processConfirmationContent(confirmationContent, slug, state) : null
  }

  /**
   * Builds view model and returns confirmation page response
   * @param {ConfirmationContent | null} confirmationContent - Confirmation content configuration
   * @param {SessionData} sessionData - Session data including reference number
   * @param {FormLike} form - Form object
   * @param {string} slug - Form slug
   * @param {Pick<ResponseToolkit, 'view'>} h - Hapi response toolkit
   * @returns {ResponseObject} Hapi response
   */
  buildAndRenderConfirmationResponse(confirmationContent, sessionData, form, slug, h) {
    const viewModel = ConfirmationService.buildViewModel({
      referenceNumber: sessionData.referenceNumber,
      businessName: sessionData.businessName,
      sbi: sessionData.sbi,
      contactName: sessionData.contactName,
      confirmationContent,
      form,
      slug
    })

    return h.view('confirmation-page', viewModel)
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
     * @param {FormResponseToolkit} h
     * @returns {Promise<ResponseObject>}
     */
    return async (request, context, h) => {
      try {
        storeSlugInContext(request, context, 'ConfirmationController')

        const cacheService = getFormsCacheService(request.server)
        const state = /** @type {FormSubmissionState} */ (await cacheService.getState(request))
        const referenceNumber = /** @type {string | undefined} */ (state.$$__referenceNumber)

        const confirmationContent = await this.loadConfirmationContent(request, state)
        /** @type {SessionData} */
        const sessionData = {
          state,
          referenceNumber: referenceNumber || 'Not available',
          businessName: /** @type {string | undefined} */ (request.yar?.get('businessName')),
          sbi: /** @type {string | undefined} */ (request.yar?.get('sbi')),
          contactName: /** @type {string | undefined} */ (request.yar?.get('contactName'))
        }
        return this.buildAndRenderConfirmationResponse(
          confirmationContent,
          sessionData,
          this.model.def,
          request.params.slug,
          h
        )
      } catch (error) {
        return this.handleError(
          /** @type {Error} */ (error),
          request,
          /** @type {ResponseToolkit} */ (/** @type {unknown} */ (h))
        )
      }
    }
  }

  /**
   * Gets the path to the status page (in this case /confirmation page) for the GET handler.
   * @param {AnyFormRequest} [request] - The request object containing the URL info
   * @param {FormContext} [context] - The context object which may contain form state
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

  /**
   * Handles errors and returns appropriate error response
   * @param {Error} error - Error object
   * @param {AnyFormRequest} request - Hapi request object
   * @param {ResponseToolkit} h - Hapi response toolkit
   * @returns {ResponseObject} Error response
   */
  handleError(error, request, h) {
    if (isBoom(error)) {
      throw error
    }
    log(
      LogCodes.CONFIRMATION.CONFIRMATION_ERROR,
      {
        userId: request.auth?.credentials?.userId || 'unknown',
        errorMessage: `Config-driven confirmation route error for slug: ${request.params?.slug || 'unknown'}. ${error.message}`
      },
      request
    )
    return h.response('Server error').code(statusCodes.internalServerError)
  }
}

/**
 * @typedef {import('./services/confirmation.service.js').ConfirmationContent} ConfirmationContent
 */

/**
 * @typedef {import('./services/confirmation.service.js').FormLike} FormLike
 */

/**
 * @typedef {object} SessionData
 * @property {FormSubmissionState} state - Cached form submission state
 * @property {string} referenceNumber - Application reference number
 * @property {string} [businessName] - Business name from session
 * @property {string} [sbi] - SBI number from session
 * @property {string} [contactName] - Contact name from session
 */

/**
 * @import { type FormContext, AnyFormRequest, FormSubmissionState } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { FormResponseToolkit } from '@defra/forms-engine-plugin/types'
 * @import { ResponseObject, type ResponseToolkit } from '@hapi/hapi'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageStatus } from '@defra/forms-model'
 */
