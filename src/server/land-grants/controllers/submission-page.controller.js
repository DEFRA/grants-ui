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
   * Extracts user identifiers from request and context
   * @private
   * @param {object} request - The request object
   * @param {object} context - The form context
   * @returns {object} - User identifiers
   */
  getUserIdentifiers(request, context) {
    const { sbi, crn } = request.auth.credentials
    const { defraId = 'defraId', frn = 'frn' } = context.state

    return {
      sbi,
      frn,
      crn: crn || context.state.crn || 'crn',
      defraId,
      clientRef: context.referenceNumber?.toLowerCase()
    }
  }

  /**
   * Validates the application
   * @private
   * @param {object} identifiers - User identifiers
   * @param {object} landParcels - Land parcels data
   * @returns {Promise<object>} - Validation result
   */
  async validateApplicationData(identifiers, landParcels = {}) {
    return validateApplication({
      applicationId: identifiers.clientRef,
      crn: identifiers.crn,
      sbi: identifiers.sbi,
      landParcels
    })
  }

  /**
   * Prepares application data for submission
   * @private
   * @param {object} identifiers - User identifiers
   * @param {object} state - Application state
   * @param {string} validationId - Validation ID
   * @returns {object} - Prepared application data
   */
  prepareApplicationData(identifiers, state, validationId) {
    return transformStateObjectToGasApplication(
      identifiers,
      { ...state, applicationValidationRunId: validationId },
      stateToLandGrantsGasAnswers
    )
  }

  /**
   * Submits the land grant application
   * @param {object} identifiers - User identifiers
   * @param {object} state - Application state
   * @param {string} validationId - Land Grants API validation ID
   * @returns {Promise<object>} - The result of the grant application submission
   */
  async submitLandGrantApplication(identifiers, state, validationId) {
    const applicationData = this.prepareApplicationData(identifiers, state, validationId)
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
      backLink: undefined,
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
    const cacheService = getFormsCacheService(request.server)
    await cacheService.setConfirmationState(request, {
      confirmed: true,
      $$__referenceNumber: context.referenceNumber
    })

    return this.proceed(request, h, this.getNextPath(context))
  }

  /**
   * Creates the POST route handler for form submission
   * @returns {Function} - The route handler function
   */
  makePostRouteHandler() {
    return async (request, context, h) => {
      try {
        const identifiers = this.getUserIdentifiers(request, context)
        const { landParcels = {} } = context.state

        // Validate application with Land Grants API
        const { id: validationId, valid } = await this.validateApplicationData(identifiers, landParcels)

        if (!valid) {
          return this.handleValidationError(h, request, context, validationId)
        }

        // Submit application to GAS
        const result = await this.submitLandGrantApplication(identifiers, context.state, validationId)

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
