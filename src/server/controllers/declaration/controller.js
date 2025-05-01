import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { formSubmissionService } from '~/src/server/common/forms/services/submission.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import {
  storeSlugInContext,
  getConfirmationPath
} from '~/src/server/common/helpers/form-slug-helper.js'

export default class DeclarationPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.viewName = 'declaration-page'
  }

  /**
   * Gets the path to the status page (in this case /confirmation page) for the POST handler.
   * @param {object} request - The request object containing the URL info
   * @param {object} [context] - The context object which may contain form state
   * @returns {string} path to the status page
   */
  getStatusPath(request, context) {
    return getConfirmationPath(request, context, 'DeclarationController')
  }

  /**
   * Override the GET handler to store the slug in context
   */
  makeGetRouteHandler() {
    // Get the parent's implementation
    const parentHandler = super.makeGetRouteHandler()

    // Return a wrapped version that stores the slug
    return async (request, context, h) => {
      // Store the slug in context if it's available in request.params
      storeSlugInContext(request, context, 'DeclarationController')

      // Call the parent handler with await since it returns a promise
      return await parentHandler(request, context, h)
    }
  }

  makePostRouteHandler() {
    const fn = async (request, context, h) => {
      try {
        // Store the slug in context for later use
        storeSlugInContext(request, context, 'DeclarationController')

        // Get cache service for later use
        const cacheService = getFormsCacheService(request.server)

        // Log current state for debugging
        request.logger.debug(
          'DeclarationController: Processing form submission'
        )
        request.logger.debug(
          'DeclarationController: Current URL:',
          request.path
        )

        const { result } = await formSubmissionService.submit(
          request.payload,
          context.state
        )

        context.referenceNumber = result.referenceNumber
        request.logger.debug(
          'DeclarationController: Got reference number:',
          context.referenceNumber
        )

        // Log submission details if available - this is not needed for the submission but it's useful for debugging
        if (result.submissionDetails) {
          request.logger.info({
            message: 'Form submission completed',
            referenceNumber: result.referenceNumber,
            fieldsSubmitted: result.submissionDetails.fieldsSubmitted,
            timestamp: result.submissionDetails.timestamp
          })
        }

        // Set confirmation state so the confirmation page knows a submission happened
        await cacheService.setConfirmationState(request, { confirmed: true })
        request.logger.debug(
          'DeclarationController: Set confirmation state to true'
        )

        // Get the redirect path
        const redirectPath = this.getStatusPath(request, context)
        request.logger.debug(
          'DeclarationController: Redirecting to:',
          redirectPath
        )

        return h.redirect(redirectPath)
      } catch (error) {
        request.logger.error(error, 'Failed to submit form')
        throw error
      }
    }

    return fn
  }
}

/**
 * @import { type FormModel } from '~/src/server/plugins/engine/models/index.js'
 * @import { type PageSummary } from '@defra/forms-model'
 */
