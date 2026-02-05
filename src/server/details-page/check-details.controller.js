import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { buildGraphQLQuery, mapResponse, processSections } from '../common/services/details-page/index.js'
import { executeConfigDrivenQuery } from '../common/services/consolidated-view/consolidated-view.service.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'

const ERROR_TITLE = 'There is a problem'

/**
 * Controller for config-driven details pages.
 * Uses metadata.detailsPage configuration to dynamically build
 * GraphQL queries, map responses, and display sections.
 */
export default class CheckDetailsController extends QuestionPageController {
  viewName = 'check-details'

  /**
   * @param {FormModel} model
   * @param {PageQuestion} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
  }

  makeGetRouteHandler() {
    return async (request, context, h) => {
      const baseViewModel = super.getViewModel(request, context)
      const config = this.model.def.metadata?.detailsPage

      if (!config) {
        return this.handleConfigError(baseViewModel, h, request)
      }

      try {
        const { sections, mappedData } = await this.fetchAndProcessData(request, config)
        request.app.detailsPageData = mappedData
        return h.view(this.viewName, { ...baseViewModel, sections })
      } catch (error) {
        return this.handleError(error, baseViewModel, h, request)
      }
    }
  }

  makePostRouteHandler() {
    return async (request, context, h) => {
      const { detailsCorrect } = request.payload || {}
      const baseViewModel = super.getViewModel(request, context)
      const config = this.model.def.metadata?.detailsPage

      if (!config) {
        return this.handleConfigError(baseViewModel, h, request)
      }

      if (!detailsCorrect) {
        return this.handleMissingSelection(request, config, baseViewModel, h)
      }

      if (detailsCorrect === 'false') {
        return h.view('incorrect-details', this.buildIncorrectDetailsViewModel(baseViewModel))
      }

      return this.handleDetailsConfirmed(request, context, config, h)
    }
  }

  /**
   * Handle POST when no radio selection was made
   * @param {AnyFormRequest} request
   * @param {object} config
   * @param {object} baseViewModel
   * @param {ResponseToolkit} h
   * @returns {Promise<ResponseObject>}
   */
  async handleMissingSelection(request, config, baseViewModel, h) {
    const validationError = { text: 'Select yes if your details are correct', href: '#detailsCorrect' }

    try {
      const { sections } = await this.fetchAndProcessData(request, config)
      return h.view(this.viewName, { ...baseViewModel, sections, errors: [validationError] })
    } catch (error) {
      log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, { errorMessage: error.message }, request)
      return h.view(this.viewName, { ...baseViewModel, errors: [validationError] })
    }
  }

  /**
   * Handle POST when user confirms details are correct
   * @param {AnyFormRequest} request
   * @param {object} context
   * @param {object} config
   * @param {ResponseToolkit} h
   * @returns {Promise<ResponseObject>}
   */
  async handleDetailsConfirmed(request, context, config, h) {
    const baseViewModel = super.getViewModel(request, context)

    try {
      const { mappedData } = await this.fetchAndProcessData(request, config)
      await this.setState(request, {
        ...context.state,
        applicant: mappedData,
        detailsConfirmedAt: new Date().toISOString()
      })
      return this.proceed(request, h, this.getNextPath(context))
    } catch (error) {
      log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, { errorMessage: error.message }, request)
      return h.view(this.viewName, {
        ...baseViewModel,
        error: {
          titleText: ERROR_TITLE,
          errorList: [{ text: 'Unable to save your details. Please try again later.', href: '' }]
        }
      })
    }
  }

  /**
   * Fetch data from consolidated view and process it according to config
   * @param {AnyFormRequest} request
   * @param {object} config - detailsPage configuration from form metadata
   * @returns {Promise<{sections: Array, mappedData: object}>}
   */
  async fetchAndProcessData(request, config) {
    const query = buildGraphQLQuery(config.query, request)
    const response = await executeConfigDrivenQuery(request, query)

    if (response?.errors?.length > 0) {
      log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, { errorMessage: response.errors[0].message }, request)
      throw new Error(response.errors[0].message)
    }

    const mappedData = mapResponse(config.responseMapping, response)
    const sections = processSections(config.displaySections, mappedData, request)
    return { sections, mappedData }
  }

  /**
   * Handle errors during data fetching
   * @param {Error} error
   * @param {object} baseViewModel
   * @param {ResponseToolkit} h
   * @param {AnyFormRequest} request
   * @returns {ResponseObject}
   */
  handleError(error, baseViewModel, h, request) {
    log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, { errorMessage: error.message }, request)
    return h.view(this.viewName, {
      ...baseViewModel,
      error: {
        titleText: ERROR_TITLE,
        errorList: [{ text: 'Unable to retrieve your details. Please try again later.', href: '' }]
      }
    })
  }

  /**
   * Handle missing configuration error
   * @param {object} baseViewModel
   * @param {ResponseToolkit} h
   * @param {AnyFormRequest} request
   * @returns {ResponseObject}
   */
  handleConfigError(baseViewModel, h, request) {
    log(LogCodes.SYSTEM.CONFIG_MISSING, { missing: ['metadata.detailsPage'] }, request)
    return h.view(this.viewName, {
      ...baseViewModel,
      error: {
        titleText: ERROR_TITLE,
        errorList: [{ text: 'This page is not configured correctly. Please contact support.', href: '' }]
      }
    })
  }

  /**
   * Build view model for the incorrect details page
   * @param {object} baseViewModel
   * @returns {object}
   */
  buildIncorrectDetailsViewModel(baseViewModel) {
    return {
      serviceName: baseViewModel.serviceName,
      serviceUrl: baseViewModel.serviceUrl,
      continueUrl: baseViewModel.serviceUrl
    }
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion } from '@defra/forms-model'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
