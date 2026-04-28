import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { buildGraphQLQuery, mapResponse, processSections } from '../common/services/details-page/index.js'
import {
  executeConfigDrivenQuery,
  hasOnlyToleratedFailures
} from '../common/services/consolidated-view/consolidated-view.service.js'
import { debug, log, LogCodes } from '../common/helpers/logging/log.js'
import { mergeAdditionalAnswers } from '../common/helpers/state/additional-answers-helper.js'
import { ComponentType } from '@defra/forms-model'
import { config } from '~/src/config/config.js'

const ERROR_TITLE = 'There is a problem'

/**
 * Controller for config-driven details pages.
 * Uses metadata.detailsPage configuration to dynamically build
 * GraphQL queries, map responses, and display sections.
 */
export default class CheckDetailsController extends QuestionPageController {
  viewName = 'check-details'
  confirmationFieldName

  /**
   * @param {FormModel} model
   * @param {PageQuestion} pageDef
   */
  constructor(model, pageDef) {
    const confirmationFieldName = model.def.metadata?.detailsPage?.confirmationFieldName ?? 'detailsConfirmed'

    // Inject `yesNo` list into the model before patching the page with RadiosField
    const yesNoList = {
      id: 'yesNo',
      name: 'yesNo',
      title: 'Yes or No',
      type: 'boolean',
      items: [
        { text: 'Yes', value: true },
        { text: 'No', value: false }
      ]
    }

    if (!model.lists.some((l) => l.name === 'yesNo')) {
      model.lists.push(yesNoList)
    }
    // Inject Html (placeholder) and RadiosField components into the page def BEFORE super() so they are
    // included in the collection's formSchema/stateSchema from the start.
    // Using RadiosField because YesNoField does not support custom error messages.
    // Placeholder ensures RadiosField is not treated as sole component by DXT, avoiding H1 legend.
    /** @type {import('@defra/forms-model').PageQuestion} */
    const patchedPageDef = {
      ...pageDef,
      components: [
        ...(pageDef.components ?? []),
        {
          type: ComponentType.Html,
          name: 'placeholder',
          title: 'Placeholder for business details',
          content: '',
          options: {}
        },
        {
          type: ComponentType.RadiosField,
          name: confirmationFieldName,
          title: 'Are these details correct?',
          list: 'yesNo',
          options: {
            required: true,
            customValidationMessages: {
              'any.required': 'Select yes if your details are correct'
            }
          }
        }
      ]
    }
    super(model, patchedPageDef)
    this.model = model
    this.pageDef = patchedPageDef
    this.confirmationFieldName = confirmationFieldName
  }

  makeGetRouteHandler() {
    return async (request, context, h) => {
      const baseViewModel = super.getViewModel(request, context)
      const detailsPageConfig = this.model.def.metadata?.detailsPage

      if (!detailsPageConfig) {
        return this.handleConfigError(baseViewModel, h, request)
      }

      try {
        const { sections, mappedData } = await this.fetchAndProcessData(request, detailsPageConfig)
        request.app.detailsPageData = mappedData
        return h.view(this.viewName, { ...baseViewModel, sections })
      } catch (error) {
        return this.handleError(error, baseViewModel, h, request)
      }
    }
  }

  makePostRouteHandler() {
    return async (request, context, h) => {
      const confirmationValue = context.payload[this.confirmationFieldName]

      const { collection, viewName, model } = this
      const { state, evaluationState } = context
      const baseViewModel = super.getViewModel(request, context)
      const detailsPageConfig = this.model.def.metadata?.detailsPage

      if (!detailsPageConfig) {
        return this.handleConfigError(baseViewModel, h, request)
      }

      if (context.errors) {
        const viewModel = this.getViewModel(request, context)
        viewModel.errors = collection.getViewErrors(viewModel.errors)
        const { sections } = await this.fetchAndProcessData(request, detailsPageConfig)
        viewModel.sections = sections

        // Filter components based on their conditions using evaluated state
        viewModel.components = this.filterConditionalComponents(viewModel, model, evaluationState)

        return h.view(viewName, viewModel)
      }

      // Save state
      await this.setState(request, state)

      if (confirmationValue === false) {
        if (config.get('externalLinks.sfd.enabled')) {
          return h.redirect(this.getSFDUpdateUrl(request))
        } else {
          return h.redirect(`/${request.params.slug}/update-details`)
        }
      }

      return this.handleDetailsConfirmed(request, context, detailsPageConfig, h)
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
      await this.setState(
        request,
        mergeAdditionalAnswers(context.state, {
          applicant: mappedData,
          detailsConfirmedAt: new Date().toISOString()
        })
      )
      return this.proceed(request, h, this.getNextPath(context))
    } catch (error) {
      debug(LogCodes.SYSTEM.EXTERNAL_API_ERROR, { endpoint: 'ConsolidatedView', errorMessage: error.message }, request)
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
    const toleratedPaths = config.toleratedFailurePaths ?? this.model.def.metadata?.toleratedFailurePaths
    const query = buildGraphQLQuery(config.query, request)
    const response = await executeConfigDrivenQuery(request, query, { toleratedPaths })

    if (response?.errors?.length > 0) {
      if (!hasOnlyToleratedFailures(response.errors, toleratedPaths)) {
        log(
          LogCodes.SYSTEM.EXTERNAL_API_ERROR,
          { endpoint: 'ConsolidatedView', errorMessage: response.errors[0].message },
          request
        )
        throw new Error(response.errors[0].message)
      }

      log(
        LogCodes.SYSTEM.CONSOLIDATED_VIEW_PARTIAL_SUCCESS,
        {
          sbi: request.auth?.credentials?.sbi,
          failedPaths: response.errors.map((e) => e.path?.join('.')).join(', '),
          statusCode: 'graphql-errors'
        },
        request
      )
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
    debug(LogCodes.SYSTEM.EXTERNAL_API_ERROR, { endpoint: 'ConsolidatedView', errorMessage: error.message }, request)
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
   * Get the URL to update business details through SFD
   * @param request
   * @returns {string}
   */
  getSFDUpdateUrl(request) {
    const { currentRelationshipId } = request.auth.credentials
    const updateUrl = config.get('externalLinks.sfd.updateUrl')
    if (!updateUrl) {
      return ''
    }

    try {
      const url = new URL(updateUrl)
      url.searchParams.set('ssoOrgId', currentRelationshipId)
      return url.toString()
    } catch (error) {
      debug(LogCodes.SYSTEM.CONFIG_INVALID, { key: 'externalLinks.sfd.updateUrl', value: updateUrl }, request)
      return ''
    }
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion } from '@defra/forms-model'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
