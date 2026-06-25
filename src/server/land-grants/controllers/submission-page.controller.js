import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { getRequiredConsents } from '~/src/server/common/utils/consents.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import {
  resolveGasConfigVersion,
  transformStateObjectToGasApplication
} from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { stateToLandGrantsGasAnswers } from '~/src/server/land-grants/mappers/state-to-gas-answers-mapper.js'
import { validateApplication } from '~/src/server/land-grants/services/land-grants.service.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'
import { persistSubmissionToApi } from '~/src/server/common/helpers/state/persist-submission-helper.js'
import { getConfirmationPath } from '~/src/server/common/helpers/form-slug-helper.js'
import { log, debug } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { getGrantCode } from '../../common/helpers/grant-code.js'

export default class SubmissionPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
    this.viewName = 'submit-your-application'
  }

  /**
   * Override back link to point to consent page when consents are required,
   * or directly to the payment check page otherwise.
   * @param {FormContextRequest} _request
   * @param {FormContext} context
   */
  getBackLink(_request, context) {
    const { state } = context
    const backPath = getRequiredConsents(state).length > 0 ? '/you-must-have-consent' : '/check-selected-land-actions'
    const { basePath } = this.model
    return { text: 'Back', href: `/${basePath}${backPath}` }
  }

  /**
   * Submits the land grant application
   * @param {AnyFormRequest} request - Request object
   * @param {object} data
   * @param {ApplicationIdentifiers} data.identifiers - User identifiers
   * @param {FormSubmissionState} data.state - Form application state
   * @param {ValidateApplicationResponse} data.validationResult - Validation result response
   * @returns {Promise<Response>} - The result of the grant application submission
   */
  async submitGasApplication(request, data) {
    const { identifiers, state, validationResult } = data
    const grantCode = getGrantCode(request)
    const additionalAnswers = /** @type {Record<string, any> | undefined} */ (state.additionalAnswers)
    const configVersion = resolveGasConfigVersion(request)
    const applicationData = transformStateObjectToGasApplication(
      identifiers,
      {
        ...state,
        ...additionalAnswers,
        validationResult
      },
      stateToLandGrantsGasAnswers,
      configVersion
    )
    return submitGrantApplication(grantCode, applicationData, request)
  }

  /**
   * Gets the confirmation page path for successful submission
   * @param {AnyFormRequest} [request] - Request object
   * @param {FormContext} [context] - Form context
   * @returns {string} - Confirmation page path
   */
  getStatusPath(request, context) {
    return getConfirmationPath(request, context, 'SubmissionPageController')
  }

  /**
   * Handles validation error response
   * @private
   * @param {Pick<ResponseToolkit, 'view'>} h - Response toolkit
   * @param {AnyFormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {string} [validationId] - Validation ID
   * @returns {ResponseObject} - Error view response
   */
  renderSubmissionError(h, request, context, validationId) {
    const grantCode = getGrantCode(request)
    log(
      LogCodes.SUBMISSION.SUBMISSION_VALIDATION_ERROR,
      {
        grantType: grantCode,
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
   * @param {AnyFormRequest} request - Request object
   * @param {FormContext & { grantVersion?: string | number }} context - Form context
   * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h - Response toolkit
   * @param {number} submissionStatus - Submission status code
   * @returns {Promise<ResponseObject>} - Redirect response
   */
  async handleSuccessfulSubmission(request, context, h, submissionStatus) {
    const { credentials: { sbi, crn } = {} } = request.auth ?? {}
    const submittedAt = new Date().toISOString()
    const cacheService = getFormsCacheService(request.server)

    // Log submission details if available
    if (submissionStatus === statusCodes.noContent) {
      const grantCode = getGrantCode(request)
      log(
        LogCodes.SUBMISSION.SUBMISSION_COMPLETED,
        {
          grantType: grantCode,
          referenceNumber: context.referenceNumber,
          numberOfFields: context.relevantState ? Object.keys(context.relevantState).length : 0,
          status: submissionStatus
        },
        request
      )

      const currentState = await cacheService.getState(request)

      // Update application status so the confirmation page knows a submission happened
      await cacheService.setState(
        request,
        /** @type {FormSubmissionState} */ (
          /** @type {unknown} */ ({
            ...currentState,
            applicationStatus: ApplicationStatus.SUBMITTED,
            submittedAt,
            submittedBy: crn
          })
        )
      )

      // Add to submissions collection
      await persistSubmissionToApi(
        {
          crn,
          sbi,
          grantCode,
          grantVersion: context.grantVersion,
          previousReferenceNumber: context.state.previousReferenceNumber,
          referenceNumber: context.referenceNumber,
          submittedAt
        },
        request
      )
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
      const grantCode = getGrantCode(request)
      const { state, referenceNumber } = context
      const additionalAnswers = /** @type {Record<string, any> | undefined} */ (state.additionalAnswers)
      const frn = additionalAnswers?.applicant ? additionalAnswers.applicant['business']?.reference : undefined

      /** @type {ApplicationIdentifiers} */
      const identifiers = {
        sbi: /** @type {string} */ (sbi),
        crn: /** @type {string} */ (crn),
        frn,
        clientRef: /** @type {string} */ (referenceNumber?.toLowerCase())
      }

      if (state.previousReferenceNumber) {
        identifiers.previousClientRef = String(state.previousReferenceNumber).toLowerCase()
      }

      try {
        const validationResult = await validateApplication({
          applicationId: /** @type {string} */ (referenceNumber),
          crn: /** @type {string} */ (crn),
          sbi: /** @type {string} */ (sbi),
          state
        })
        const { valid } = validationResult
        if (!valid) {
          return this.renderSubmissionError(h, request, context, validationResult.id)
        }

        const result = await this.submitGasApplication(request, {
          identifiers,
          state,
          validationResult
        })

        log(
          LogCodes.SUBMISSION.SUBMISSION_SUCCESS,
          {
            grantType: grantCode,
            referenceNumber: context.referenceNumber
          },
          request
        )

        return await this.handleSuccessfulSubmission(request, context, h, result.status)
      } catch (error) {
        debug(
          LogCodes.SUBMISSION.SUBMISSION_FAILURE,
          {
            grantType: grantCode,
            referenceNumber: context.referenceNumber,
            sbi,
            crn,
            errorMessage: /** @type {Error} */ (error).message
          },
          request
        )
        return this.renderSubmissionError(h, request, context)
      }
    }

    return fn
  }
}

/**
 * Applicant identifiers, plus the previous client reference used for resubmissions.
 * @typedef {ApplicantIdentifiers & { previousClientRef?: string }} ApplicationIdentifiers
 */

/**
 * @import { FormContext, FormContextRequest, AnyFormRequest, FormSubmissionState } from '@defra/forms-engine-plugin/types'
 * @import { ResponseObject, type ResponseToolkit } from '@hapi/hapi'
 * @import { ValidateApplicationResponse } from '../types/land-grants.client.d.js'
 * @import { ApplicantIdentifiers } from '../types/gas-payload.d.js'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageSummary } from '@defra/forms-model'
 */
