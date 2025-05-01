import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { formSubmissionService } from '~/src/server/common/forms/services/submission.js'
import { getFormsCacheService } from '../../common/helpers/forms-cache/forms-cache.js'

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
    // First try to get slug from request params (available during initial page render)
    let slug = request?.params?.slug

    // Next try to get it from context state (available during form submission)
    if (!slug && context?.state?.formSlug) {
      slug = context.state.formSlug
      request?.logger?.debug('Using slug from context.state.formSlug:', slug)
    }

    if (slug) {
      request?.logger?.debug('DeclarationController: Using slug:', slug)
      return `/${slug}/confirmation`
    }

    request?.logger?.debug(
      'DeclarationController: No slug found, using default path'
    )
    return '/confirmation'
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
      if (request?.params?.slug && !context.state.formSlug) {
        context.state.formSlug = request.params.slug
        request.logger.debug(
          'DeclarationController: Storing slug in context (GET):',
          request.params.slug
        )
      }

      // Call the parent handler with await since it returns a promise
      return await parentHandler(request, context, h)
    }
  }

  makePostRouteHandler() {
    const fn = async (request, context, h) => {
      try {
        // Store the slug in context for later use
        if (request?.params?.slug && !context.state.formSlug) {
          context.state.formSlug = request.params.slug
          request.logger.debug(
            'DeclarationController: Storing slug in context (POST):',
            request.params.slug
          )
        }

        const cacheService = getFormsCacheService(request.server)
        const { result } = await formSubmissionService.submit(
          request.payload,
          context.state
        )

        context.referenceNumber = result.referenceNumber

        // Log submission details if available
        if (result.submissionDetails) {
          request.logger.info({
            message: 'Form submission completed',
            referenceNumber: result.referenceNumber,
            fieldsSubmitted: result.submissionDetails.fieldsSubmitted,
            timestamp: result.submissionDetails.timestamp
          })
        }

        await cacheService.setConfirmationState(request, { confirmed: true })
        return h.redirect(this.getStatusPath(request, context))
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
