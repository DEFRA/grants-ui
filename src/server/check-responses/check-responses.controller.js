import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { getTaskPageBackLink } from '~/src/server/task-list/task-list.helper.js'

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
  }

  /**
   * @param {{ details?: any[], checkAnswers?: any[] }} viewModel
   * @param {any} landParcels
   */
  #applyLandParcels(viewModel, landParcels) {
    if (Array.isArray(landParcels) && landParcels.length) {
      const displayValue = landParcels.join(', ')
      viewModel.details?.forEach((detail, di) => {
        const ii = detail.items?.findIndex((/** @type {any} */ item) => item.name === 'landParcels') ?? -1
        if (ii !== -1 && viewModel.checkAnswers) {
          viewModel.checkAnswers[di].summaryList.rows[ii].value = { html: displayValue }
        }
      })
    }
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
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @returns {object} The view model
   */
  getSummaryViewModel(request, context) {
    const viewModel = super.getSummaryViewModel(request, context)

    const { pageDef } = this

    const backLink = getTaskPageBackLink(viewModel, pageDef)
    const sectionTitle = this.section?.hideTitle !== true ? this.section?.title : ''

    this.#excludeCheckDetailsEntries(viewModel)
    this.#applyLandParcels(viewModel, context?.state?.landParcels)

    return {
      ...viewModel,
      sectionTitle,
      ...(backLink ? { backLink } : {})
    }
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
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      return this.proceed(request, h, this.getNextPath(context))
    }
    return fn
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 * @import { FormModel } from '@defra/forms-engine-plugin/engine/models/index.js'
 * @import { PageSummary } from '@defra/forms-model'
 * @import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
 */
