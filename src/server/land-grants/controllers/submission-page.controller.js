import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { config } from '~/src/config/config.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { stateToLandGrantsGasAnswers } from '~/src/server/land-grants/mappers/state-to-gas-answers-mapper.js'
import { validateApplication } from '~/src/server/land-grants/services/land-grants.service.js'

export default class SubmissionPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.viewName = 'submit-your-application'
    this.grantCode = config.get('landGrants.grantCode')
  }

  /**
   * Submits the land grant application
   * @param {object} identifiers - User identifiers
   * @param {object} state - Application state
   * @param {string} validationId - Land Grants API validation ID
   * @returns {Promise<object>} - The result of the grant application submission
   */
  async submitGasApplication(data) {
    const { identifiers, state, validationId } = data
    const applicationData = transformStateObjectToGasApplication(
      identifiers,
      { ...state, applicationValidationRunId: validationId },
      stateToLandGrantsGasAnswers
    )

    return submitGrantApplication(this.grantCode, applicationData)
  }

  /**
   * Handles validation error response
   * @private
   * @param {object} h - Response toolkit
   * @param {object} request - Request object
   * @param {object} context - Form context
   * @param {string} validationId - Validation ID
   * @returns {object} - Error view response
   */
  handleValidationError(h, request, context, validationId) {
    return h.view('submission-error', {
      ...this.getViewModel(request, context),
      backLink: null,
      heading: 'Sorry, there was a problem validating the application',
      refNumber: validationId
    })
  }

  /**
   * Handles successful submission
   * @private
   * @param {object} request - Request object
   * @param {object} context - Form context
   * @param {object} h - Response toolkit
   * @returns {Promise<object>} - Redirect response
   */
  async handleSuccessfulSubmission(request, context, h) {
    const isProduction = config.get('isProduction')
    const cacheService = getFormsCacheService(request.server)
    await cacheService.setConfirmationState(request, {
      confirmed: true,
      $$__referenceNumber: context.referenceNumber
    })

    // Remove this once GAS/GAE are ready to handle different application statuses
    if (!isProduction) {
      await cacheService.clearState(request, true)
    }
    return this.proceed(request, h, this.getNextPath(context))
  }

  /**
   * Creates the POST route handler for form submission
   * @returns {Function} - The route handler function
   */
  makePostRouteHandler() {
    return async (request, context, h) => {
      try {
        const { state, referenceNumber } = context
        const { sbi, crn } = request.auth.credentials

        // Validate application with Land Grants API
        const validationResult = await validateApplication({ applicationId: referenceNumber, crn, sbi, state })
        const { id: validationId, valid } = validationResult
        if (!valid) {
          return this.handleValidationError(h, request, context, validationId)
        }

        const result = await this.submitGasApplication({
          identifiers: {
            sbi,
            crn,
            frn: state.applicant?.business?.reference,
            clientRef: referenceNumber?.toLowerCase()
          },
          state,
          validationId
        })

        request.logger.info('Form submission completed', result)
        return await this.handleSuccessfulSubmission(request, context, h)
      } catch (error) {
        request.logger.error('Error submitting application:', error)
        throw error
      }
    }
  }
}

/**
 * @import { type FormModel } from '~/src/server/plugins/engine/models/index.js'
 * @import { type PageSummary } from '@defra/forms-model'
 */
