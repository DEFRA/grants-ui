import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { formSubmissionService } from '~/src/server/common/forms/services/submission.js'

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
   * @returns {string} path to the status page
   */
  getStatusPath() {
    return '/adding-value/confirmation'
  }

  makePostRouteHandler() {
    const fn = async (request, context, h) => {
      try {
        const { result } = await formSubmissionService.submit(
          request.payload,
          context.state
        )

        context.referenceNumber = result.referenceNumber

        return h.redirect(this.getStatusPath())
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
