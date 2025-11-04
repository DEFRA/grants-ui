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
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

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
   * Gets the confirmation page path for successful submission
   * @private
   * @param {object} request - Request object
   * @param {object} context - Form context
   * @returns {string} - Confirmation page path
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
   * @param {string} [validationId] - Validation ID
   * @returns {object} - Error view response
   */
  handleSubmissionError(h, request, context, validationId) {
    log(
      LogCodes.SUBMISSION.SUBMISSION_VALIDATION_ERROR,
      {
        grantType: this.grantCode,
        referenceNumber: context.referenceNumber,
        validationId: validationId || context.referenceNumber || 'N/A'
      },
      request
    )

    return h.view('submission-error', {
      ...this.getSummaryViewModel(request, context),
      backLink: null,
      heading: 'Sorry, there was a problem submitting the application',
      refNumber: validationId || context.referenceNumber || 'N/A'
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
    const { credentials: { sbi, crn } = {} } = request.auth ?? {}
    const submittedAt = new Date().toISOString()
    const cacheService = getFormsCacheService(request.server)

    // Log submission details if available
    if (submissionStatus === statusCodes.noContent) {
      log(LogCodes.SUBMISSION.SUBMISSION_COMPLETED, {
        grantType: this.grantCode,
        referenceNumber: context.referenceNumber,
        numberOfFields: context.relevantState ? Object.keys(context.relevantState).length : 0,
        status: submissionStatus
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
      const { credentials: { sbi, crn } = {} } = request.auth ?? {}
      const { state, referenceNumber } = context
      const frn = state.applicant ? state.applicant['business']?.reference : undefined

      try {
        const validationResult = await validateApplication({ applicationId: referenceNumber, crn, sbi, state })
        const { id: validationId, valid } = validationResult
        if (!valid) {
          return this.handleSubmissionError(h, request, context, validationId)
        }

        const result = await this.submitGasApplication({
          identifiers: { sbi, crn, frn, clientRef: referenceNumber?.toLowerCase() },
          state,
          validationId
        })

        log(LogCodes.SUBMISSION.SUBMISSION_SUCCESS, {
          grantType: this.grantCode,
          referenceNumber: context.referenceNumber
        }, request)

        return await this.handleSuccessfulSubmission(request, context, h, result.status)
      } catch (error) {
        log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
          endpoint: `Land grants submission`,
          error: `submitting application for sbi: ${sbi} and crn: ${crn} - ${error.message}`
        }, request)
        return this.handleSubmissionError(h, request, context)
      }
    }

    return fn
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, type ResponseToolkit } from '@hapi/hapi'
 */
