import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import {
  buildPrintViewModel,
  enrichDefinitionWithListItems,
  processConfigurablePrintContent
} from '../common/helpers/print-application-service/print-application-service.js'
import { createBusinessRows, createContactRows, createPersonRows } from '../common/helpers/create-rows.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { getPrintSubmittedApplicationPath } from '../common/helpers/form-slug-helper.js'
import { ApplicationStatus } from '../common/constants/application-status.js'

export default class PrintSubmittedApplicationController extends StatusPageController {
  viewName = 'print-submitted-application.html'
  /**
   * @param {FormModel} model
   * @param {PageStatus} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
  }

  /**
   * Builds applicant details sections for forms that have showApplicantDetails enabled.
   * @param request
   * @param {Record<string, any>} state
   * @param {{ metadata?: { printPage?: { showApplicantDetails?: boolean } } }} definition
   * @returns {{ person: { rows: object[] }, business: { rows: object[] }, contact: { rows: object[] } } | null}
   */
  resolveApplicantDetailsSections(request, state, definition) {
    if (!definition.metadata?.printPage?.showApplicantDetails) {
      return null
    }

    const applicantData = state.additionalAnswers?.applicant
    if (!applicantData?.customer && !applicantData?.business?.name) {
      return null
    }

    const sbi = /** @type {string} */ (request.auth?.credentials?.sbi ?? '')

    return {
      person: createPersonRows(applicantData.customer?.name),
      business: createBusinessRows(sbi, applicantData.business),
      contact: createContactRows(applicantData.business)
    }
  }

  /**
   * Reads the YAML form definition, builds the print view model and renders the view.
   * @param {object} form - Form object
   * @param request
   * @param {ResponseToolkit} h
   */
  async buildPrintResponse({ form, state, slug }, request, h) {
    const definition = this.model.def

    enrichDefinitionWithListItems(definition)

    const configurablePrintContent = processConfigurablePrintContent(
      /** @type {Record<string, any>} */ (definition.metadata)?.printPage?.configurablePrintContent,
      slug
    )

    const applicant = state.additionalAnswers?.applicant || {}
    const customerName = applicant.customer?.name
    const sessionData = {
      contactName: customerName
        ? [customerName.title, customerName.first, customerName.middle, customerName.last].filter(Boolean).join(' ') ||
          undefined
        : undefined,
      businessName: applicant.business?.name,
      sbi: /** @type {string | undefined} */ (request.auth?.credentials?.sbi)
    }

    const applicantDetailsSections = this.resolveApplicantDetailsSections(request, state, definition)

    const viewModel = buildPrintViewModel({
      definition,
      form,
      answers: state,
      referenceNumber: state.$$__referenceNumber,
      submittedAt: state.submittedAt,
      slug,
      sessionData,
      configurablePrintContent,
      applicantDetailsSections
    })

    return h.view('print-submitted-application', viewModel)
  }

  /**
   * This method is called when there is a GET request to the print submitted application page.
   * The method then uses the `h.view` method to render the page using the
   * view name and the view model.
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the score page.
     * @param {object} request - Hapi request object
     * @param {FormContext} context
     * @param {object} h - Hapi response toolkit
     */
    return async (request, context, h) => {
      const cacheService = getFormsCacheService(request.server)
      const state = await cacheService.getState(request)

      if (!state || state?.applicationStatus !== ApplicationStatus.SUBMITTED) {
        return h.response('Application not submitted').code(statusCodes.forbidden)
      }

      const form = this.model.def
      const slug = request.params.slug

      return this.buildPrintResponse(
        {
          form,
          state,
          slug
        },
        request,
        h
      )
    }
  }

  /**
   * Gets the path to the status page (in this case /print-submitted-application page) for the GET handler.
   * @param {object} [request] - The request object containing the URL info
   * @param {object} [context] - The context object which may contain form state
   * @returns {string} path to the status page
   */
  getStatusPath(request, context) {
    return getPrintSubmittedApplicationPath(request, context, 'ConfirmationController')
  }
}

/**
 * @import { type FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageStatus } from '@defra/forms-model'
 */
