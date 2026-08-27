import nunjucks from 'nunjucks'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { getCurrentClaim, upsertCurrentClaim } from '~/src/server/claims/services/claim-state.js'
import { getAvailableClaimEntitlements } from '~/src/server/common/services/grant-application/grant-application.service.js'
import { getGrantCode } from '~/src/server/common/helpers/grant-code.js'
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
   * Calls the GAS available-claims entitlements endpoint for the current grant
   * and application reference number and maps the first available claim's
   * `totalHectares.value` onto `totalEligibleArea`.
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @returns {Promise<Record<string, string | number>>} data items keyed by item name
   */
  async fetchGasEntitlements(request, context) {
    const grantCode = getGrantCode(request)
    const state = context.state ?? {}
    const clientRef = /** @type {string} */ (state.$$__referenceNumber)

    const { availableClaims } = await getAvailableClaimEntitlements(grantCode, clientRef, request)
    /* Note: for Woodland there is only 1 claim and it always returns hectares -
       future schemes may need to alter this logic for multiple claims */
    const [firstClaim] = availableClaims ?? []
    const totalEligibleArea = /** @type {number | undefined} */ (firstClaim?.data?.totalHectares?.value)

    return {
      ...(totalEligibleArea != null ? { totalEligibleArea } : {}),
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

  /**
   * Clear the stored amounts on the current (unsubmitted) claim.
   *
   * The amounts must never outlive the round of API calls that produced them,
   * so when a fetch fails the previously stored values are removed rather than
   * left behind for the declaration controller to submit. No-ops when there is
   * no reference number or no current claim, so a failed first visit does not
   * create an empty claim.
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @returns {Promise<void>}
   */
  async clearCurrentClaimAmounts(request, context) {
    const state = context.state ?? {}
    const referenceNumber = /** @type {string | undefined} */ (state.$$__referenceNumber)

    if (!referenceNumber || !getCurrentClaim(state)) {
      return
    }

    const { claims } = upsertCurrentClaim(state, { referenceNumber })

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
      /** @type {Record<string, string | number>} */
      let claimData

      // The fetch is all-or-nothing: a partial set of amounts must never be
      // persisted, and a failure clears whatever an earlier visit stored before
      // the error reaches the standard error page.
      try {
        claimData = await this.fetchClaimData(request, context)
      } catch (error) {
        await this.clearCurrentClaimAmounts(request, context)
        throw error
      }

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
