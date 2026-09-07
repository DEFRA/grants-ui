import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { getTaskPageBackLink } from '~/src/server/task-list/task-list.helper.js'
import { buildConfirmLandAndActionsViewModel } from '~/src/server/land-grants/view-models/confirm-land-and-actions.view-model.js'
import { CONFIRM_LAND_AND_ACTIONS_PATH } from '~/src/server/land-grants/utils/confirm-land-and-actions-navigation.js'

export default class CheckResponsesPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.model = model
    this.viewName = 'check-responses-page'

    // Resolve section
    if (pageDef.section) {
      this.section = model.getSection(pageDef.section)
    }

    /** @type {AdditionalSection[] | undefined} */
    this.additionalSections = /** @type {{ additionalSections?: AdditionalSection[] } | undefined} */ (
      model?.def?.metadata?.pageConfig?.[pageDef.path]
    )?.additionalSections
  }

  /**
   * Replaces the engine's single land-parcels answer with the detailed parcel
   * and payment cards used by the confirm land and actions page. Older journeys
   * that store parcel references as an array retain their compact answer.
   * @param {{ details?: any[], checkAnswers?: any[] }} viewModel
   * @param {Record<string, any>} state
   * @returns {boolean} Whether the detailed land and actions summary was applied
   */
  #applyLandParcels(viewModel, state) {
    const { landParcels, payment, agreementStartDate, agreementEndDate, agreementTotalPence } = state

    if (Array.isArray(landParcels) && landParcels.length) {
      const displayValue = landParcels.join(', ')
      viewModel.details?.forEach((detail, di) => {
        const ii = detail.items?.findIndex((/** @type {any} */ item) => item.name === 'landParcels') ?? -1
        if (ii !== -1 && viewModel.checkAnswers) {
          viewModel.checkAnswers[di].summaryList.rows[ii].value = { html: displayValue }
        }
      })

      return false
    }

    if (
      !landParcels ||
      Array.isArray(landParcels) ||
      typeof landParcels !== 'object' ||
      Object.keys(landParcels).length === 0 ||
      !payment ||
      !Array.isArray(viewModel.details) ||
      !Array.isArray(viewModel.checkAnswers)
    ) {
      return false
    }

    const landAndActionsSummary = {
      ...buildConfirmLandAndActionsViewModel(
        {
          ...payment,
          agreementStartDate: agreementStartDate ?? payment.agreementStartDate,
          agreementEndDate: agreementEndDate ?? payment.agreementEndDate,
          agreementTotalPence: agreementTotalPence ?? payment.agreementTotalPence
        },
        landParcels
      ),
      changeHref: this.getHref(CONFIRM_LAND_AND_ACTIONS_PATH)
    }
    const mapSelectPaths = new Set(
      (this.model?.def?.pages ?? [])
        .filter((/** @type {any} */ page) => page.controller === 'MapSelectPageController')
        .map((/** @type {any} */ page) => page.path)
    )
    const { checkAnswers } = viewModel
    let applied = false

    viewModel.details.forEach((detail, di) => {
      const parcelIndex =
        detail.items?.findIndex(
          (/** @type {any} */ item) => item.name === 'landParcels' || mapSelectPaths.has(item.page?.path)
        ) ?? -1
      const checkAnswer = checkAnswers[di]

      if (parcelIndex === -1 || !checkAnswer) {
        return
      }

      detail.items = detail.items.filter((/** @type {any} */ _item, /** @type {number} */ i) => i !== parcelIndex)
      const rows = checkAnswer.summaryList?.rows ?? []
      checkAnswers[di] = {
        ...checkAnswer,
        summaryList: {
          ...checkAnswer.summaryList,
          rows: rows.filter((/** @type {any} */ _row, /** @type {number} */ i) => i !== parcelIndex)
        },
        landAndActionsSummary
      }
      applied = true
    })

    return applied
  }

  /**
   * Appends read-only summary sections configured on the page (via `config.additionalSections`),
   * populated with values already present on state that were not directly submitted by the user
   * on this journey (e.g. a payment total calculated on a previous page).
   * @param {{ checkAnswers?: any[] }} viewModel
   * @param {AdditionalSection[] | undefined} additionalSections
   * @param {Record<string, any>} state
   * @param {Set<string>} [excludedStateValues]
   */
  #appendAdditionalSections(viewModel, additionalSections, state, excludedStateValues = new Set()) {
    if (!Array.isArray(additionalSections) || !viewModel.checkAnswers) {
      return
    }

    additionalSections.forEach((section) => {
      const configuredItems = section.items ?? []
      const items = configuredItems.filter((item) => !excludedStateValues.has(item.stateValue))

      // The detailed land and actions summary already renders totalPayment in
      // the shared payment card, so do not add the former configured duplicate.
      if (configuredItems.length > 0 && items.length === 0) {
        return
      }

      const rows = items.map((item) => ({
        key: { text: item.title },
        value: { text: state?.[item.stateValue] ?? 'Not provided' }
      }))

      viewModel.checkAnswers?.push({
        title: { text: section.title },
        summaryList: { rows }
      })
    })
  }

  /**
   * @param {{ details?: any[], checkAnswers?: any[] }} viewModel
   */
  #excludeCheckDetailsEntries(viewModel) {
    const excludedPaths = new Set(
      (this.model?.def?.pages ?? [])
        .filter((/** @type {any} */ page) => page.controller === 'CheckDetailsController')
        .map((/** @type {any} */ page) => page.path)
    )

    if (excludedPaths.size === 0 || !Array.isArray(viewModel.details)) {
      return
    }

    /** @type {any[]} */
    const keptDetails = []
    /** @type {any[]} */
    const keptCheckAnswers = []

    viewModel.details.forEach((detail, di) => {
      const items = detail.items ?? []
      const keep = items.map((/** @type {any} */ item) => !excludedPaths.has(item.page?.path))
      const filteredItems = items.filter((/** @type {any} */ _item, /** @type {number} */ i) => keep[i])

      if (filteredItems.length === 0) {
        return
      }

      keptDetails.push({ ...detail, items: filteredItems })

      const checkAnswer = viewModel.checkAnswers?.[di]
      if (checkAnswer) {
        const rows = checkAnswer.summaryList?.rows ?? []
        keptCheckAnswers.push({
          ...checkAnswer,
          summaryList: {
            ...checkAnswer.summaryList,
            rows: rows.filter((/** @type {any} */ _row, /** @type {number} */ i) => keep[i])
          }
        })
      }
    })

    viewModel.details = keptDetails
    viewModel.checkAnswers = keptCheckAnswers
  }

  /**
   * Builds the view model for the page
   * @param {FormContextRequest} request
   * @param {FormContext} context
   * @returns {SummaryViewModel} The view model
   */
  getSummaryViewModel(request, context) {
    const viewModel = super.getSummaryViewModel(request, context)

    const { pageDef } = this

    const backLink = /** @type {BackLink | null} */ (getTaskPageBackLink(viewModel, pageDef))
    const sectionTitle = this.section?.hideTitle !== true ? this.section?.title : ''

    this.#excludeCheckDetailsEntries(viewModel)
    const state = /** @type {Record<string, any>} */ (/** @type {unknown} */ (context?.state ?? {}))
    const hasLandAndActionsSummary = this.#applyLandParcels(viewModel, state)
    this.#appendAdditionalSections(
      viewModel,
      this.additionalSections,
      state,
      hasLandAndActionsSummary ? new Set(['totalPayment']) : undefined
    )

    // SummaryViewModel is a class with a private `summaryDetails` member and does not
    // permit extra properties (`sectionTitle`), so a structural spread cannot satisfy
    // the class type even though the runtime shape is a correct superset. Cast through
    // `unknown` to keep this purely type-only with no runtime change.
    return /** @type {SummaryViewModel} */ (
      /** @type {unknown} */ ({
        ...viewModel,
        sectionTitle,
        ...(backLink ? { backLink } : {})
      })
    )
  }

  /**
   *
   * @this {QuestionPageController}
   */
  makePostRouteHandler() {
    /**
     * Handle POST requests to the confirm farm details page.
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
 * @typedef {object} AdditionalSectionItem
 * @property {string} title - Row label shown in the summary list
 * @property {string} stateValue - Key to read from form state for the row value
 */

/**
 * @typedef {object} AdditionalSection
 * @property {string} title - Section heading
 * @property {AdditionalSectionItem[]} [items] - Rows to render in this section
 */

/**
 * @import { FormContext, FormContextRequest, AnyFormRequest, FormResponseToolkit, BackLink } from '@defra/forms-engine-plugin/types'
 * @import { ResponseObject } from '@hapi/hapi'
 * @import { FormModel, SummaryViewModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageSummary } from '@defra/forms-model'
 * @import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
 */
