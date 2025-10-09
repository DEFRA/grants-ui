import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { config } from '~/src/config/config.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { transformStateObjectToGasApplication } from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { stateToLandGrantsGasAnswers } from '~/src/server/land-grants/mappers/state-to-gas-answers-mapper.js'
import { validateApplication } from '~/src/server/land-grants/services/land-grants.service.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'
import { persistSubmissionToApi } from '~/src/server/common/helpers/state/persist-submission-helper.js'
import { getConfirmationPath } from '~/src/server/common/helpers/form-slug-helper.js'

export default class SubmissionPageController extends SummaryPageController {
  viewName = 'submit-your-application'
  grantCode = config.get('landGrants.grantCode')

  /**
   * Submits the land grant application
   * @param {object} data
   * @param {object} data.identifiers - User identifiers
   * @param {object} data.state - Form application state
   * @param {string} data.validationId - Land grants validation ID
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
   * Handles successful submission
   * @private
   * @param {object} request - Request object
   * @param {object} context - Form context
   * @returns {string} - Status url path
   */
  getStatusPath(request, context) {
    return getConfirmationPath(request, context, 'SubmissionPageController')
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
      ...this.getSummaryViewModel(request, context),
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
   * @param {number} submissionStatus - Submission status code
   * @param {object} h - Response toolkit
   * @returns {Promise<object>} - Redirect response
   */
  async handleSuccessfulSubmission(request, context, h, submissionStatus) {
    const { sbi, crn } = request.auth?.credentials || {}
    const submittedAt = new Date().toISOString()
    const cacheService = getFormsCacheService(request.server)

    // Log submission details if available
    if (submissionStatus === statusCodes.noContent) {
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
        submittedAt,
        submittedBy: crn
      })

      // Add to submissions collection
      await persistSubmissionToApi({
        crn,
        sbi,
        grantCode: this.grantCode,
        grantVersion: context.grantVersion,
        referenceNumber: context.referenceNumber,
        submittedAt
      })
    }

    // Get the redirect path
    const redirectPath = this.getStatusPath(request, context)
    return h.redirect(redirectPath)
  }

  /**
   * Creates the POST route handler for form submission
   */
  makePostRouteHandler() {
    /**
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      try {
        const { state, referenceNumber } = context
        const { sbi, crn } = request.auth.credentials
        const frn = state.applicant ? state.applicant['business']?.reference : undefined

        // Validate application with Land Grants API
        const validationResult = await validateApplication({ applicationId: referenceNumber, crn, sbi, state })
        const { id: validationId, valid } = validationResult
        if (!valid) {
          return this.handleValidationError(h, request, context, validationId)
        }

        const result = await this.submitGasApplication({
          identifiers: { sbi, crn, frn, clientRef: referenceNumber?.toLowerCase() },
          state,
          validationId
        })

        request.logger.info('Form submission completed', result)
        return await this.handleSuccessfulSubmission(request, context, h, result.status)
      } catch (error) {
        request.logger.error('Error submitting application:', error)
        throw error
      }
    }

    return fn
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, type ResponseToolkit } from '@hapi/hapi'
 */
