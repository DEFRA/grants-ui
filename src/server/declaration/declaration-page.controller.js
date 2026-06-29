import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { getConfirmationPath, storeSlugInContext } from '~/src/server/common/helpers/form-slug-helper.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { submitGrantApplication } from '~/src/server/common/services/grant-application/grant-application.service.js'
import {
  resolveGasConfigVersion,
  transformStateObjectToGasApplication
} from '~/src/server/common/helpers/grant-application-service/state-to-gas-payload-mapper.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { persistSubmissionToApi } from '~/src/server/common/helpers/state/persist-submission-helper.js'
import { ApplicationStatus } from '~/src/server/common/constants/application-status.js'
import { handleGasApiError } from '~/src/server/common/helpers/gas-error-messages.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { getTaskPageBackLink } from '~/src/server/task-list/task-list.helper.js'
import { getGrantCode } from '../common/helpers/grant-code.js'
import { transformWoodlandAnswers } from '~/src/server/woodland/mappers/state-to-gas-answers-mapper.js'

/** @type {Record<string, (submissionState: Record<string, unknown>, rawState: Record<string, unknown>) => object>} */
const answerTransformers = {
  woodland: transformWoodlandAnswers
}

export default class DeclarationPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
    this.viewName = 'declaration-page.html'

    // Override view name
    if (pageDef.view) {
      this.viewName = pageDef.view
    }

    // Resolve section
    if (pageDef.section) {
      this.section = model.getSection(pageDef.section)
    }
  }

  /**
   * Builds the view model for the declaration page
   * @param {FormContextRequest} request
   * @param {FormContext} context
   * @returns {SummaryViewModel} The view model
   */
  getSummaryViewModel(request, context) {
    const viewModel = super.getSummaryViewModel(request, context)

    const { pageDef } = this

    const backLink = getTaskPageBackLink(viewModel, pageDef)
    const sectionTitle = this.section?.hideTitle !== true ? this.section?.title : ''

    return /** @type {SummaryViewModel} */ (
      /** @type {unknown} */ ({
        ...viewModel,
        sectionTitle,
        ...(backLink ? { backLink } : {})
      })
    )
  }

  /**
   * Gets the path to the status page (in this case /confirmation page) for the POST handler.
   * @param {AnyFormRequest} [request] - The request object containing the URL info
   * @param {FormContext} [context] - The context object which may contain form state
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
    /**
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {FormResponseToolkit} h
     */
    return (request, context, h) => {
      // Store the slug in context if it's available in request.params
      storeSlugInContext(request, context, 'DeclarationController')

      return parentHandler(request, context, h)
    }
  }

  /**
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @returns {Record<string, unknown>} The GAS application payload
   */
  buildApplicationData(request, context) {
    const { state, relevantState, referenceNumber, payload } = context

    // Include form fields from declaration page and convert to booleans as appropriate
    const { action, ...rest } = payload
    /** @param {unknown} value */
    const toBoolean = (value) => {
      if (value === 'true') {
        return true
      }
      if (value === 'false') {
        return false
      }
      return value
    }
    const declarationPayload = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, toBoolean(value)]))

    const frn =
      /** @type {Record<string, any> | undefined} */ (state.additionalAnswers)?.applicant?.['business']?.reference ??
      'undefined'

    /** @type {{ clientRef: string, sbi: string, crn: string, frn: string, previousClientRef?: string }} */
    const identifiers = {
      clientRef: referenceNumber.toLowerCase(),
      sbi: /** @type {string} */ (request.auth?.credentials?.sbi),
      crn: /** @type {string} */ (request.auth?.credentials?.crn),
      frn
    }

    if (state.previousReferenceNumber) {
      identifiers.previousClientRef = /** @type {string} */ (state.previousReferenceNumber).toLowerCase()
    }

    const submissionState = {
      referenceNumber,
      ...relevantState,
      .../** @type {Record<string, unknown> | undefined} */ (state.additionalAnswers),
      ...declarationPayload
    }

    const grantCode = getGrantCode(request)
    const transformAnswers = answerTransformers[grantCode] ?? ((s) => s)
    const configVersion = resolveGasConfigVersion(request)

    return transformStateObjectToGasApplication(
      identifiers,
      submissionState,
      (/** @type {Record<string, unknown>} */ s) => transformAnswers(s, state),
      configVersion
    )
  }

  /**
   * @param {{ request: AnyFormRequest, context: FormContext & { grantVersion?: string | number }, cacheService: StatePersistenceService, applicationData: Record<string, any>, sbi: unknown, crn: unknown, grantCode: string }} options
   */
  async handleSuccessfulSubmission({ request, context, cacheService, applicationData, sbi, crn, grantCode }) {
    log(
      LogCodes.SUBMISSION.SUBMISSION_COMPLETED,
      {
        grantType: grantCode,
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
      submittedBy: /** @type {string | undefined} */ (crn)
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
        previousReferenceNumber: context.state.previousReferenceNumber,
        submittedAt: applicationData.metadata?.submittedAt
      },
      request
    )
  }

  /**
   * @param {{ h: FormResponseToolkit, error: Error, request: AnyFormRequest, context: FormContext, sbi: unknown, crn: unknown }} options
   */
  handlePostError({ h, error, request, context, sbi, crn }) {
    log(
      LogCodes.SUBMISSION.SUBMISSION_FAILURE,
      {
        errorMessage: error.message,
        referenceNumber: context.referenceNumber,
        sbi,
        crn,
        grantType: getGrantCode(request)
      },
      request
    )

    if (error.name === 'GrantApplicationServiceApiError') {
      return handleGasApiError(/** @type {ResponseToolkit} */ (h), context, error)
    }

    throw error
  }

  makePostRouteHandler() {
    /**
     * @param {FormRequestPayload} request
     * @param {FormContext} context
     * @param {FormResponseToolkit} h
     */
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
        const grantCode = getGrantCode(request)

        const applicationData = this.buildApplicationData(request, context)

        const result = await submitGrantApplication(grantCode, applicationData, request)

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
 * @import { FormModel, SummaryViewModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { AnyFormRequest, FormContext, FormContextRequest, FormRequest, FormRequestPayload, FormResponseToolkit } from '@defra/forms-engine-plugin/types'
 * @import { PageSummary } from '@defra/forms-model'
 * @import { ResponseToolkit } from '@hapi/hapi'
 * @import { StatePersistenceService } from '~/src/server/common/services/state-persistence/state-persistence.service.js'
 */
