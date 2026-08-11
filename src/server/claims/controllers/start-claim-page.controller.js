import nunjucks from 'nunjucks'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { upsertCurrentClaim } from '~/src/server/claims/services/claim-state.js'
import { resolveStrategy } from '~/src/server/payment/resolve-strategy.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { formatAreaUnit } from '~/src/shared/format-area-unit.js'
import { formatLinearUnit } from '~/src/shared/format-linear-unit.js'

/**
 * Nunjucks environment used to render each `Html` component's content with the
 * fetched claim data. The app's `formatCurrency`, `formatAreaUnit` and
 * `formatLinearUnit` filters are registered so the form definition can turn a
 * pence integer into a formatted pounds value
 * (e.g. `{{ (totalClaimAmountPence / 100) | formatCurrency }}`) and a unit
 * abbreviation into a human-readable name (e.g. `{{ unit | formatAreaUnit }}`).
 */
const claimContentEnv = new nunjucks.Environment(null, { autoescape: true })
claimContentEnv.addFilter('formatCurrency', formatCurrency)
claimContentEnv.addFilter('formatAreaUnit', formatAreaUnit)
claimContentEnv.addFilter('formatLinearUnit', formatLinearUnit)

/**
 * Generic controller for the start of a claim journey (e.g. "Review your
 * claim"). It is designed to be reused across grants with different claim
 * journeys and data by driving everything from the page `config:` block in the
 * form definition YAML:
 *
 *   controller: StartClaimPageController
 *   config:
 *     submitButtonText: Continue            # button label (handled by the view)
 *     paymentStrategy: woodland-claim       # key from payment-strategies.js (optional)
 *     rpaDetails:                           # GDS details block rendered by the view
 *       title: If you need help with your claim
 *       content: |
 *         <p class="govuk-body">Phone: 03000 200 301</p>
 *
 * The claim amount (`totalClaimAmountPence`) is derived by calling the `paymentStrategy`
 * (a land-grants payment call) defined in config.
 *
 * @extends QuestionPageController
 */
export default class StartClaimPageController extends QuestionPageController {
  viewName = 'start-claim'

  /**
   * @param {FormModel} model
   * @param {import('@defra/forms-model').Page} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.pageConfig = model?.def?.metadata?.pageConfig?.[pageDef?.path] ?? {}

    if (pageDef.section) {
      this.section = model.getSection(pageDef.section)
    }
  }

  /**
   * Fetch claim data.
   *
   * Returns the combined result: the GAS-derived data items, with
   * `totalClaimAmountPence` taken from the payment call when a strategy ran.
   *
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @returns {Promise<Record<string, string | number>>} data items keyed by item name
   */
  async fetchClaimData(request, context) {
    const gasData = await this.fetchGasEntitlements(request, context)
    const paymentResult = await this.calculateClaimPayment(request, context, gasData)

    return {
      ...gasData,
      ...(paymentResult ? { totalClaimAmountPence: paymentResult.totalPence } : {})
    }
  }

  /**
   * Fetch claim data from GAS.
   *
   * TODO: The GAS API is not available yet, so values are stubbed
   *
   * @param {AnyFormRequest} _request
   * @param {FormContext} _context
   * @returns {Promise<Record<string, string | number>>} data items keyed by item name
   */
  async fetchGasEntitlements(_request, _context) {
    return {
      totalEligibleArea: 156.1025,
      unit: 'ha'
    }
  }

  /**
   * Render each `Html` component's content through Nunjucks so the form
   * definition can use dynamic values (e.g. `{{ totalEligibleArea }}`).
   * @param {object[]} components
   * @param {Record<string, string | number>} data
   * @returns {object[]}
   */
  renderComponentsWithData(components, data) {
    return (components ?? []).map((component) => {
      if (component.type === 'Html' && typeof component.model?.content === 'string') {
        return {
          ...component,
          model: {
            ...component.model,
            content: claimContentEnv.renderString(component.model.content, data)
          }
        }
      }
      return component
    })
  }

  /**
   * Calculate the claim payment for the current claim using the configured
   * `paymentStrategy` (a land-grants payment call), returning the strategy
   * result.
   *
   * The payment context passed to the strategy is assembled from the GAS claim
   * data (`totalEligibleArea` as `totalAreaHa`), the application reference
   * number held in state (as `applicationId`) and the authenticated user's
   * `sbi`/`crn`.
   *
   * No-ops (returns `undefined`) when no `paymentStrategy` is configured, or
   * when the application reference number or total eligible area is missing.
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Record<string, string | number>} gasData
   * @returns {Promise<PaymentStrategyResult | undefined>}
   */
  async calculateClaimPayment(request, context, gasData) {
    const paymentStrategy = /** @type {string | undefined} */ (this.pageConfig.paymentStrategy)

    if (!paymentStrategy) {
      return undefined
    }

    const state = context.state ?? {}
    const referenceNumber = /** @type {string | undefined} */ (state.$$__referenceNumber)
    const totalAreaHa = /** @type {number | undefined} */ (gasData.totalEligibleArea)

    if (!referenceNumber || totalAreaHa == null) {
      return undefined
    }

    const strategy = resolveStrategy(paymentStrategy)
    const userContext = getLandGrantsUserContext(request)
    const credentials = /** @type {{ sbi?: string, crn?: string }} */ (request.auth?.credentials ?? {})

    return strategy.calculatePayment(
      {
        totalAreaHa,
        applicationId: referenceNumber,
        sbi: /** @type {string} */ (credentials.sbi),
        crn: credentials.crn
      },
      userContext
    )
  }

  /**
   * Ensure the current (unsubmitted) claim is stored in state with the fetched
   * amounts and a derived claim number, so the declaration controller can read
   * them from state when building the GAS claim payload. Idempotent: repeated
   * visits update the same current claim rather than creating duplicates.
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Record<string, string | number>} claimData
   * @returns {Promise<void>}
   */
  async persistCurrentClaim(request, context, claimData) {
    const state = context.state ?? {}
    const referenceNumber = /** @type {string | undefined} */ (state.$$__referenceNumber)

    if (!referenceNumber) {
      return
    }

    const { claims } = upsertCurrentClaim(state, {
      referenceNumber,
      totalEligibleArea: /** @type {number | undefined} */ (claimData.totalEligibleArea),
      unit: /** @type {string | undefined} */ (claimData.unit),
      totalClaimAmountPence: /** @type {number | undefined} */ (claimData.totalClaimAmountPence)
    })

    await this.setState(
      request,
      /** @type {import('@defra/forms-engine-plugin/types').FormSubmissionState} */ (
        /** @type {unknown} */ ({ ...state, claims })
      )
    )
  }

  makeGetRouteHandler() {
    /**
     * Handle GET requests to the start claim page.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {FormResponseToolkit} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const claimData = await this.fetchClaimData(request, context)

      await this.persistCurrentClaim(request, context, claimData)

      const baseViewModel = super.getViewModel(request, context)

      const viewModel = {
        ...baseViewModel,
        components: this.renderComponentsWithData(baseViewModel.components, claimData),
        ...claimData
      }

      return h.view(this.viewName, viewModel)
    }

    return fn
  }

  makePostRouteHandler() {
    /**
     * Handle POST requests to the start claim page.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {FormResponseToolkit} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }
}

/**
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
 * @import { FormContext, AnyFormRequest, FormResponseToolkit } from '@defra/forms-engine-plugin/types'
 * @import { ResponseObject } from '@hapi/hapi'
 * @import { PaymentStrategyResult } from '~/src/server/payment/payment-strategies.d.js'
 */
