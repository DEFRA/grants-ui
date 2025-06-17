import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import {
  getConfirmationPath,
  storeSlugInContext
} from '~/src/server/common/helpers/form-slug-helper.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { transformStateObjectToGasApplication } from '../../common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { transformAnswerKeysToText } from './state-to-gas-answers-mapper.js'

export default class DeclarationPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.viewName = 'declaration-page'
    this.grantCode = model.def.metadata.submission.grantCode
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

        const identifiers = {
          clientRef: context.referenceNumber?.toLowerCase(),
          sbi: 'sbi',
          frn: 'frn',
          crn: 'crn',
          defraId: 'defraId'
        }

        const stateWithTextAnswers = transformAnswerKeysToText(
          context.relevantState,
          this.model.componentDefMap,
          this.model.listDefMap
        )
        stateWithTextAnswers.referenceNumber = context.referenceNumber

        const applicationData = transformStateObjectToGasApplication(
          identifiers,
          stateWithTextAnswers,
          (state) => state
        )

        const result = await submitGrantApplication(
          this.grantCode,
          applicationData
        )

        request.logger.debug(
          'DeclarationController: Got reference number:',
          result.clientRef
        )

        // Log submission details if available
        if (result.clientRef) {
          request.logger.info({
            message: 'Form submission completed',
            referenceNumber: result.clientRef,
            numberOfSubmittedFields: context.relevantState
              ? Object.keys(context.relevantState).length
              : 0,
            timestamp: new Date().toISOString()
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
