import nunjucks from 'nunjucks'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { upsertCurrentClaim } from '~/src/server/claims/services/claim-state.js'
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
 * Stubbed claim data, keyed by the data item name that a page's
 * `config.dataSources` can request.
 *
 * The raw values are deliberately unformatted: `totalEligibleArea` is the
 * numeric area, `unit` is its unit, and `totalClaimAmountPence` is an integer
 * amount in pence. The `£` sign and the pounds/pence formatting are applied in
 * the form-definition template.
 *
 * TODO: Replace this stub with real values fetched from the relevant claim
 * APIs once they are available (see {@link StartClaimPageController#fetchClaimData}).
 * @type {Record<string, string | number>}
 */
const STUBBED_CLAIM_DATA = {
  totalEligibleArea: 24.95,
  unit: 'ha',
  totalClaimAmountPence: 150000
}

/**
 * Generic controller for the start of a claim journey (e.g. "Review your
 * claim"). It is designed to be reused across grants with different claim
 * journeys and data by driving everything from the page `config:` block in the
 * form definition YAML:
 *
 *   controller: StartClaimPageController
 *   config:
 *     submitButtonText: Continue            # button label (handled by the view)
 *     rpaDetails:                           # GDS details block rendered by the view
 *       title: If you need help with your claim
 *       content: |
 *         <p class="govuk-body">Phone: 03000 200 301</p>
 *     dataSources:                          # where to get which data items from
 *       - name: claims                      # placeholder API/source identifier
 *         items:
 *           - totalEligibleArea
 *           - unit
 *           - totalClaimAmountPence
 *
 * The values fetched for the requested `dataSources[].items` are exposed to the
 * view and used to render each `Html` component's `content` through Nunjucks, so
 * the form definition can reference dynamic values (e.g. `{{ totalEligibleArea }}`)
 * instead of hardcoding them.
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
   * Fetch claim data from one or more APIs.
   *
   * The APIs to call and which data items to read from each are described by
   * `config.dataSources` in the form definition.
   *
   * TODO: The claim data APIs are not available yet, so values are stubbed from
   * {@link STUBBED_CLAIM_DATA}. Replace this with real API calls, using each
   * `dataSources[].name` to decide which API to call, once they are available.
   *
   * @param {AnyFormRequest} _request
   * @param {FormContext} _context
   * @returns {Promise<Record<string, string | number>>} data items keyed by item name
   */
  async fetchClaimData(_request, _context) {
    const dataSources = /** @type {{ name?: string, items?: string[] }[]} */ (this.pageConfig.dataSources ?? [])
    const data = /** @type {Record<string, string | number>} */ ({})

    for (const source of dataSources) {
      for (const item of source.items ?? []) {
        // TODO: call the API identified by `source.name` for `item` instead of
        // reading from the stub below.
        data[item] = STUBBED_CLAIM_DATA[item]
      }
    }

    return data
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
 */
