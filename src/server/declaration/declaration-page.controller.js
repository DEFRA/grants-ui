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
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { getTaskPageBackLink } from '~/src/server/task-list/task-list.helper.js'

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
   * Builds the view model for the declaration page
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @returns {object} The view model
   */
  getSummaryViewModel(request, context) {
    const viewModel = super.getSummaryViewModel(request, context)

    const { pageDef } = this

    const backLink = getTaskPageBackLink(viewModel, pageDef)

    return {
      ...viewModel,
      ...(backLink ? { backLink } : {})
    }
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
    return (request, context, h) => {
      // Store the slug in context if it's available in request.params
      storeSlugInContext(request, context, 'DeclarationController')

      return parentHandler(request, context, h)
    }
  }

  buildApplicationData(request, context) {
    const stateWithTextAnswers = transformAnswerKeysToText(
      context.relevantState,
      this.model.componentDefMap,
      this.model.listDefIdMap
    )

    stateWithTextAnswers.referenceNumber = context.referenceNumber

    const identifiers = {
      clientRef: context.referenceNumber.toLowerCase(),
      sbi: request.auth?.credentials?.sbi,
      frn: 'frn',
      crn: request.auth?.credentials?.crn
    }

    return transformStateObjectToGasApplication(identifiers, stateWithTextAnswers, (s) => s)
  }

  async handleSuccessfulSubmission({ request, context, cacheService, applicationData, sbi, crn, grantCode }) {
    log(
      LogCodes.SUBMISSION.SUBMISSION_COMPLETED,
      {
        grantType: this.grantCode,
        referenceNumber: context.referenceNumber,
        numberOfFields: context.relevantState ? Object.keys(context.relevantState).length : 0,
        status: 'success'
      },
      request
    )

    const currentState = await cacheService.getState(request)

    await cacheService.setState(request, {
      ...currentState,
      applicationStatus: ApplicationStatus.SUBMITTED,
      submittedAt: applicationData.metadata?.submittedAt,
      submittedBy: crn
    })

    log(
      LogCodes.SUBMISSION.APPLICATION_STATUS_UPDATED,
      { controller: 'DeclarationController', status: 'SUBMITTED' },
      request
    )

    await persistSubmissionToApi(
      {
        crn,
        sbi,
        grantCode,
        grantVersion: context.grantVersion,
        referenceNumber: context.referenceNumber,
        submittedAt: applicationData.metadata?.submittedAt
      },
      request
    )
  }

  handlePostError({ h, error, request, context, sbi, crn }) {
    log(
      LogCodes.SUBMISSION.SUBMISSION_FAILURE,
      {
        errorMessage: error.message,
        referenceNumber: context.referenceNumber,
        sbi,
        crn,
        grantType: this.grantCode
      },
      request
    )

    if (error.name === 'GrantApplicationServiceApiError') {
      return handleGasApiError(h, context, error)
    }

    throw error
  }

  makePostRouteHandler() {
    return async (request, context, h) => {
      const { sbi, crn } = request.auth.credentials
      storeSlugInContext(request, context, 'DeclarationController')

      const cacheService = getFormsCacheService(request.server)
      log(
        LogCodes.SUBMISSION.SUBMISSION_PROCESSING,
        { controller: 'DeclarationController', path: request.path },
        request
      )

      try {
        const applicationData = this.buildApplicationData(request, context)
        const grantCode = request.params?.slug

        const result = await submitGrantApplication(this.grantCode, applicationData, request)

        if (result.status === statusCodes.noContent) {
          await this.handleSuccessfulSubmission({
            request,
            context,
            cacheService,
            applicationData,
            sbi,
            crn,
            grantCode
          })
        }

        const redirectPath = this.getStatusPath(request, context)
        log(LogCodes.SUBMISSION.SUBMISSION_REDIRECT, { controller: 'DeclarationController', redirectPath }, request)
        return h.redirect(redirectPath)
      } catch (error) {
        return this.handlePostError({ h, error, request, context, sbi, crn })
      }
    }
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { AnyFormRequest, FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { PageSummary } from '@defra/forms-model'
 */
