import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { getConfirmationPath, storeSlugInContext } from '~/src/server/common/helpers/form-slug-helper.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { transformAnswerKeysToText } from './state-to-gas-answers-mapper.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { persistSubmissionToApi } from '~/src/server/common/helpers/state/persist-submission-helper.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'
import { handleGasApiError } from '~/src/server/common/helpers/gas-error-messages.js'
import { applicationStatuses } from '../gas/status/mock-status.controller.js'

export default class DeclarationPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
    this.viewName = 'declaration-page.html'
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
        request.logger.debug('DeclarationController: Processing form submission')
        request.logger.debug('DeclarationController: Current URL:', request.path)

        const { sbi, crn } = request.auth.credentials
        const grantCode = request.params?.slug

        const identifiers = {
          clientRef: context.referenceNumber.toLowerCase(),
          sbi,
          frn: 'frn',
          crn,
          defraId: 'defraId'
        }

        const stateWithTextAnswers = transformAnswerKeysToText(
          context.relevantState,
          this.model.componentDefMap,
          this.model.listDefIdMap
        )
        stateWithTextAnswers.referenceNumber = context.referenceNumber

        const applicationData = transformStateObjectToGasApplication(
          identifiers,
          stateWithTextAnswers,
          (state) => state
        )

        const result = await submitGrantApplication(this.grantCode, applicationData)

        // Log submission details if available
        if (result.status === statusCodes.noContent) {
          request.logger.info({
            message: 'Form submission completed',
            referenceNumber: context.referenceNumber,
            numberOfSubmittedFields: context.relevantState ? Object.keys(context.relevantState).length : 0,
            timestamp: new Date().toISOString()
          })

          const currentState = await cacheService.getState(request)

          // Update application status so the confirmation page knows a submission happened
          await cacheService.setState(request, {
            ...currentState,
            applicationStatus: ApplicationStatus.SUBMITTED,
            submittedAt: applicationData.metadata?.submittedAt,
            submittedBy: crn
          })
          request.logger.debug('DeclarationController: Set application status to SUBMITTED')

          // Add to submissions collection
          await persistSubmissionToApi({
            crn,
            sbi,
            grantCode,
            grantVersion: context.grantVersion,
            referenceNumber: context.referenceNumber,
            submittedAt: applicationData.metadata?.submittedAt
          })

          const grantId = request.params?.slug
          const applicationRef = context.referenceNumber
          const key = `${applicationRef}_${grantId}`
          applicationStatuses.set(key, 'RECEIVED')
        }

        // Get the redirect path
        const redirectPath = this.getStatusPath(request, context)
        request.logger.debug('DeclarationController: Redirecting to:', redirectPath)

        return h.redirect(redirectPath)
      } catch (error) {
        request.logger.error(error, 'Failed to submit form')

        if (error.name === 'GrantApplicationServiceApiError') {
          return handleGasApiError(h, context, error)
        }

        throw error
      }
    }

    return fn
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageSummary } from '@defra/forms-model'
 */
