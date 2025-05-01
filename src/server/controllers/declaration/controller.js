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
   * @returns {string} path to the status page
   */
  getStatusPath(request) {
    // Get the slug directly from request params
    const slug = request?.params?.slug
    
    if (slug) {
      console.log('DeclarationController: Using slug from request.params.slug:', slug)
      return `/${slug}/confirmation`
    }
    
    console.log('DeclarationController: No slug found, using default path')
    return '/confirmation'
  }

  makePostRouteHandler() {
    const fn = async (request, context, h) => {
      try {
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
        return h.redirect(this.getStatusPath(request))
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
