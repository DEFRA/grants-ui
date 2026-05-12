import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { TerminalPageController } from '@defra/forms-engine-plugin/controllers/TerminalPageController.js'
import { buildGraphQLQuery, mapResponse, processSections } from '../common/services/details-page/index.js'
import {
  executeConfigDrivenQuery,
  hasOnlyToleratedFailures
} from '../common/services/consolidated-view/consolidated-view.service.js'
import { debug, log, LogCodes } from '../common/helpers/logging/log.js'
import { mergeAdditionalAnswers } from '../common/helpers/state/additional-answers-helper.js'
import { ComponentType, ControllerType } from '@defra/forms-model'
import { config } from '~/src/config/config.js'
import { findFormBySlug } from '~/src/server/common/forms/services/find-form-by-slug.js'

const ERROR_TITLE = 'There is a problem'
const UPDATE_DETAILS_PATH = '/update-details'

/**
 * Terminal page controller for the update-details page.
 * Only used when externalLinks.sfd.enabled === false
 * Shown when the user indicates their details are incorrect.
 * Extends TerminalPageController so the forms-engine-plugin enforces
 * that users cannot navigate past this point in the journey.
 */
export class UpdateDetailsPageController extends TerminalPageController {
  makeGetRouteHandler() {
    return async (request, _context, h) => {
      const { slug } = request.params

      const form = await findFormBySlug(slug)
      const metadata = /** @type {Record<string, unknown>} */ (form?.metadata ?? {})

      return h.view('incorrect-details', {
        pageTitle: 'Update your details',
        serviceName: form?.title,
        serviceUrl: `/${slug}`,
        backLink: { href: `/${slug}/check-details` },
        incorrectDetailsContent: metadata.incorrectDetailsContent ?? null,
        supportEmail: metadata.supportEmail ?? null
      })
    }
  }
}

/**
 * Controller for config-driven details pages.
 * Uses metadata.detailsPage configuration to dynamically build
 * GraphQL queries, map responses, and display sections.
 */
export default class CheckDetailsController extends QuestionPageController {
  viewName = 'check-details'
  confirmationFieldName
  isSfdEnabled

  /**
   * @param {FormModel} model
   * @param {PageQuestion} pageDef
   */
  constructor(model, pageDef) {
    const confirmationFieldName = model.def.metadata?.detailsPage?.confirmationFieldName ?? 'detailsConfirmed'
    const isSfdEnabled = config.get('externalLinks.sfd.enabled')
    const noButtonLabel = isSfdEnabled ? 'No, update my details on the Farm and Land Service' : 'No'

    // Inject `yesNo` list into the model before patching the page with RadiosField
    const yesNoList = {
      id: 'yesNo',
      name: 'yesNo',
      title: 'Yes or No',
      type: 'boolean',
      items: [
        { text: 'Yes', value: true },
        { text: noButtonLabel, value: false }
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
    this.isSfdEnabled = isSfdEnabled
  }

  /**
   * Inject the update-details terminal page into the model if not already present.
   * Only used when externalLinks.sfd.enabled === false
   * Must be called lazily (not in the constructor) because model.pages, model.pageMap,
   * and model.componentMap are not yet assigned when page controllers are constructed
   * (FormModel sets them after all pages are created via createPage()).
   */
  ensureUpdateDetailsPage() {
    // When SFD external redirect is enabled, the user is sent directly to the external
    // service on clicking No — the update-details page is never needed or shown.
    if (this.isSfdEnabled) {
      return
    }
    const { model, confirmationFieldName } = this
    if (!model.pages.some((p) => p.path === UPDATE_DETAILS_PATH)) {
      const conditionName = 'detailsNotConfirmed'

      // Register the condition in the model so the engine can evaluate it
      // when determining the next page path (V2 engine checks page.condition.fn)
      if (!model.conditions[conditionName]) {
        model.conditions[conditionName] = {
          name: conditionName,
          fn: (evaluationState) => evaluationState[confirmationFieldName] === false
        }
      }

      const updateDetailsPageDef = {
        title: 'Update your details',
        path: UPDATE_DETAILS_PATH,
        controller: ControllerType.Terminal,
        condition: conditionName,
        components: []
      }
      // @ts-ignore - TerminalPageController.d.ts omits the constructor declaration, but the
      // constructor is inherited from QuestionPageController(model, pageDef) at runtime.
      const updateDetailsController = new UpdateDetailsPageController(model, updateDetailsPageDef)

      // Manually set the condition on the controller instance, since PageController resolves
      // pageDef.condition from model.conditions in its constructor — but our condition is
      // registered after the constructor runs for other pages.
      // @ts-ignore - condition is declared on PageController but TerminalPageController.d.ts
      // references a different base class path, so TypeScript cannot see the inherited property.
      updateDetailsController.condition = model.conditions[conditionName]

      // Insert update-details immediately after check-details in model.pages so that
      // getNextPath finds it before any unconditional pages (e.g. status page).
      const checkDetailsIndex = model.pages.indexOf(this)
      const insertAt = checkDetailsIndex >= 0 ? checkDetailsIndex + 1 : model.pages.length
      model.def.pages.push(updateDetailsPageDef)
      model.pages.splice(insertAt, 0, updateDetailsController)
      model.pageMap?.set(UPDATE_DETAILS_PATH, updateDetailsController)
    }
  }

  makeGetRouteHandler() {
    return async (request, context, h) => {
      this.ensureUpdateDetailsPage()

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
      this.ensureUpdateDetailsPage()
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

      if (confirmationValue === false && this.isSfdEnabled) {
        // When SFD external redirect is enabled, do NOT persist the confirmation answer.
        // Saving detailsConfirmed: false would cause the engine to treat check-details as
        // "answered" when walking from start/summary, routing past it instead of back to it.
        // We DO set checkDetailsChangesPending: true so the forms-engine-plugin and the
        // status-helper both behave correctly and we show the check-details page.
        const { currentRelationshipId } = request.auth.credentials
        const updateUrl = config.get('externalLinks.sfd.updateUrl')
        if (updateUrl) {
          try {
            const url = new URL(updateUrl)
            url.searchParams.set('ssoOrgId', currentRelationshipId)
            const { [this.confirmationFieldName]: _removed, ...stateWithoutConfirmation } = state
            await this.setState(request, { ...stateWithoutConfirmation, checkDetailsChangesPending: true })
            return h.redirect(url.toString())
          } catch {
            // fall through to save state and proceed if URL is malformed
          }
        }
      }

      // Clear checkDetailsChangesPending once user has selected Yes
      const { checkDetailsChangesPending: _cleared, ...stateWithoutPending } = state
      context.state = stateWithoutPending
      const { checkDetailsChangesPending: _clearedPayload, ...payloadWithoutPending } = context.payload
      context.payload = payloadWithoutPending

      // Save state
      await this.setState(request, stateWithoutPending)

      if (confirmationValue === false) {
        return this.proceed(request, h, this.getNextPath(context))
      }

      return this.handleDetailsConfirmed(request, context, detailsPageConfig, h)
    }
  }

  /**
   * Handle POST when user confirms details are correct
   * @param {AnyFormRequest} request
   * @param {object} context
   * @param {object} detailsConfig
   * @param {ResponseToolkit} h
   * @returns {Promise<ResponseObject>}
   */
  async handleDetailsConfirmed(request, context, detailsConfig, h) {
    const baseViewModel = super.getViewModel(request, context)

    try {
      const { mappedData } = await this.fetchAndProcessData(request, detailsConfig)
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
   * @param {object} detailsConfig - detailsPage configuration from form metadata
   * @returns {Promise<{sections: Array, mappedData: object}>}
   */
  async fetchAndProcessData(request, detailsConfig) {
    const toleratedPaths = detailsConfig.toleratedFailurePaths ?? this.model.def.metadata?.toleratedFailurePaths
    const query = buildGraphQLQuery(detailsConfig.query, request)
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

    const mappedData = mapResponse(detailsConfig.responseMapping, response)
    const sections = processSections(detailsConfig.displaySections, mappedData, request)
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
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageQuestion } from '@defra/forms-model'
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
