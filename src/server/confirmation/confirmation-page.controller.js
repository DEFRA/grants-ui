// @ts-nocheck - noImplicitAny debt, remove when this file is typed
import nunjucks from 'nunjucks'
import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import { config } from '~/src/config/config.js'
import { getConfirmationPath, storeSlugInContext } from '~/src/server/common/helpers/form-slug-helper.js'
import { getFormsCacheService } from '~/src/server/common/helpers/forms-cache/forms-cache.js'
import { getLatestClaim } from '~/src/server/claims/services/claim-state.js'
import { ConfirmationService } from './services/confirmation.service.js'
import { ComponentsRegistry } from './services/components.registry.js'
import { isBoom } from '@hapi/boom'
import { log, LogCodes } from '../common/helpers/logging/log.js'
import { statusCodes } from '../common/constants/status-codes.js'

/**
 * Selects which reference the confirmation panel displays. Set via the
 * page-level `config.confirmationType`; defaults to `application`.
 */
export const ConfirmationType = {
  APPLICATION: 'application',
  CLAIM: 'claim'
}

export default class ConfirmationPageController extends StatusPageController {
  viewName = 'confirmation-page.html'

  /**
   * @param {FormModel} model
   * @param {PageStatus} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
    this.pageDef = pageDef
  }

  /**
   * Resolves this page's `config:` block, hoisted onto `metadata.pageConfig[path]`
   * by `hoistPageConfig`. Read lazily so it always reflects the definition
   * available when the request is handled.
   * @returns {Record<string, unknown> | undefined} The page config, if any
   */
  getPageConfig() {
    const metadata = /** @type {Record<string, unknown>} */ (this.model?.def?.metadata ?? {})
    return /** @type {Record<string, Record<string, unknown>> | undefined} */ (metadata.pageConfig)?.[
      this.pageDef?.path
    ]
  }

  /**
   * Whether this page confirms an application (default) or a claim, resolved per
   * request from `config.confirmationType`.
   * @returns {string} The confirmation type for this page
   */
  get confirmationType() {
    return /** @type {string} */ (this.getPageConfig()?.confirmationType ?? ConfirmationType.APPLICATION)
  }

  /**
   * Resolves the value shown in the confirmation panel. A claim confirmation
   * shows the most recent claim's `claimNumber`; an application confirmation
   * shows the application reference number. Falls back to a friendly default
   * when the value is missing.
   * @param {FormSubmissionState} state - the DXT state object containing application details
   * @returns {string} The panel reference value
   */
  resolvePanelReference(state) {
    if (this.confirmationType === ConfirmationType.CLAIM) {
      return getLatestClaim(state)?.claimNumber || 'Not available'
    }
    return /** @type {string | undefined} */ (state.$$__referenceNumber) || 'Not available'
  }

  /**
   * Builds the Nunjucks render context for this page's confirmation content,
   * exposing the dynamic state values (`referenceNumber`) under friendly names
   * alongside the full state.
   * @param {FormSubmissionState} state - the DXT state object containing application details
   * @param {string} [slug] - Form slug
   * @returns {Record<string, unknown>} Render context
   */
  buildRenderContext(state, slug) {
    return {
      ...state,
      referenceNumber: /** @type {string | undefined} */ (state.$$__referenceNumber),
      slug,
      cdpEnvironment: config.get('cdpEnvironment')
    }
  }

  /**
   * Render each `Html` component's `content` through Nunjucks so the form
   * definition's `components:` list can reference dynamic state values (e.g.
   * `{{ referenceNumber }}` or `{{ slug }}`). Existing component placeholders
   * (e.g. `{{DEFRASUPPORTDETAILS}}`) and `{{SLUG}}` are resolved first so they
   * keep working alongside the Nunjucks render.
   * @param {object[]} components - Components resolved from the page view model
   * @param {FormSubmissionState} state - the DXT state object containing application details
   * @param {string} [slug] - Form slug
   * @returns {object[]} Components with rendered `Html` content
   */
  renderComponents(components, state, slug) {
    const data = {
      ...state,
      referenceNumber: /** @type {string | undefined} */ (state.$$__referenceNumber),
      slug,
      SLUG: slug,
      cdpEnvironment: config.get('cdpEnvironment')
    }

    return (components ?? []).map((component) => {
      if (component.type === 'Html' && typeof component.model?.content === 'string') {
        let content = ComponentsRegistry.replaceComponents(component.model.content)

        if (slug) {
          content = content.replaceAll('{{SLUG}}', slug)
        }

        return {
          ...component,
          model: {
            ...component.model,
            content: nunjucks.renderString(content, data)
          }
        }
      }
      return component
    })
  }

  /**
   * Loads and processes this page's confirmation content, resolved from the
   * page-level `config:` block (`metadata.pageConfig[path]`).
   * @param {AnyFormRequest} request - The request object
   * @param {FormSubmissionState} state - the DXT state object containing application details
   * @returns {Promise<ConfirmationContent | null>} Processed confirmation content
   */
  async loadConfirmationContent(request, state) {
    const form = this.model.def

    const { slug } = request.params

    const { confirmationContent } = await ConfirmationService.loadConfirmationContent(form, this.pageDef?.path)

    return confirmationContent
      ? ConfirmationService.processConfirmationContent(confirmationContent, slug, this.buildRenderContext(state, slug))
      : null
  }

  /**
   * Builds view model and returns confirmation page response
   * @param {ConfirmationContent | null} confirmationContent - Confirmation content configuration
   * @param {SessionData} sessionData - Session data including reference number
   * @param {FormLike} form - Form object
   * @param {string} slug - Form slug
   * @param {Pick<ResponseToolkit, 'view'>} h - Hapi response toolkit
   * @param {object[]} [components] - Rendered page components for the confirmation body
   * @returns {ResponseObject} Hapi response
   */
  buildAndRenderConfirmationResponse(confirmationContent, sessionData, form, slug, h, components) {
    const viewModel = ConfirmationService.buildViewModel({
      referenceNumber: sessionData.referenceNumber,
      businessName: sessionData.businessName,
      sbi: sessionData.sbi,
      contactName: sessionData.contactName,
      confirmationContent,
      form,
      slug,
      components
    })

    return h.view('confirmation-page', viewModel)
  }

  /**
   * This method is called when there is a GET request to the confirmation page.
   * The method then uses the `h.view` method to render the page using the
   * view name and the view model.
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the score page.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {FormResponseToolkit} h
     * @returns {Promise<ResponseObject>}
     */
    return async (request, context, h) => {
      try {
        storeSlugInContext(request, context, 'ConfirmationController')

        const cacheService = getFormsCacheService(request.server)
        const state = /** @type {FormSubmissionState} */ (await cacheService.getState(request))
        const { slug } = request.params

        const confirmationContent = await this.loadConfirmationContent(request, state)

        // The confirmation body is rendered from the page's standard `components:`
        // list. Each `Html` component's content is rendered with the current state
        // so tokens like `{{ referenceNumber }}` and `{{ slug }}` resolve.
        // @ts-ignore - super resolves to QuestionPageController.getViewModel
        const baseViewModel = super.getViewModel(request, context)
        const components = this.renderComponents(baseViewModel?.components, state, slug)

        // The panel reference comes from state: the application reference number
        // for an application confirmation, or the most recent claim number for a
        // claim confirmation (`config.confirmationType: claim`).
        const panelReference = this.resolvePanelReference(state)
        /** @type {SessionData} */
        const sessionData = {
          state,
          referenceNumber: panelReference,
          businessName: /** @type {string | undefined} */ (request.yar?.get('businessName')),
          sbi: /** @type {string | undefined} */ (request.yar?.get('sbi')),
          contactName: /** @type {string | undefined} */ (request.yar?.get('contactName'))
        }
        return this.buildAndRenderConfirmationResponse(
          confirmationContent,
          sessionData,
          this.model.def,
          slug,
          h,
          components
        )
      } catch (error) {
        return this.handleError(
          /** @type {Error} */ (error),
          request,
          /** @type {ResponseToolkit} */ (/** @type {unknown} */ (h))
        )
      }
    }
  }

  /**
   * Returns this page's own path so the forms engine treats each confirmation
   * page (e.g. `/confirmation`, `/claim-confirmation`) as its own relevant path.
   *
   * `StatusPageController.getRelevantPath()` calls this with no arguments and the
   * forms engine only dispatches the page handler when the relevant path matches
   * the page path (`relevantPath.startsWith(page.path)`). Returning a single
   * hardcoded `/confirmation` for every confirmation page made the engine redirect
   * `/claim-confirmation` to `/confirmation` (which the claim-journey status rules
   * then bounced on to `/claim`).
   * @returns {string} path to the status page
   */
  getStatusPath() {
    return this.pageDef?.path ?? getConfirmationPath(undefined, undefined, 'ConfirmationController')
  }

  /**
   * Override to use the slug for getting the start path
   * @returns {string} The start path for the form
   */
  getStartPath() {
    // @ts-ignore - super not being recognised as QuestionPageController as it is two levels above and it's on a node module
    const defaultPath = super.getStartPath()

    // Try to get the slug from the model if possible
    const slug = this.model?.def?.metadata?.slug
    if (slug) {
      return `/${slug}/start`
    }

    return defaultPath
  }

  /**
   * Handles errors and returns appropriate error response
   * @param {Error} error - Error object
   * @param {AnyFormRequest} request - Hapi request object
   * @param {ResponseToolkit} h - Hapi response toolkit
   * @returns {ResponseObject} Error response
   */
  handleError(error, request, h) {
    if (isBoom(error)) {
      throw error
    }
    log(
      LogCodes.CONFIRMATION.CONFIRMATION_ERROR,
      {
        userId: request.auth?.credentials?.userId || 'unknown',
        errorMessage: `Config-driven confirmation route error for slug: ${request.params?.slug || 'unknown'}. ${error.message}`
      },
      request
    )
    return h.response('Server error').code(statusCodes.internalServerError)
  }
}

/**
 * @typedef {import('./services/confirmation.service.js').ConfirmationContent} ConfirmationContent
 */

/**
 * @typedef {import('./services/confirmation.service.js').FormLike} FormLike
 */

/**
 * @typedef {object} SessionData
 * @property {FormSubmissionState} state - Cached form submission state
 * @property {string} referenceNumber - Application reference number
 * @property {string} [businessName] - Business name from session
 * @property {string} [sbi] - SBI number from session
 * @property {string} [contactName] - Contact name from session
 */

/**
 * @import { type FormContext, AnyFormRequest, FormSubmissionState } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { FormResponseToolkit } from '@defra/forms-engine-plugin/types'
 * @import { ResponseObject, type ResponseToolkit } from '@hapi/hapi'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageStatus } from '@defra/forms-model'
 */
