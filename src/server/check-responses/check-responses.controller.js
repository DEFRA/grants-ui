import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { getTaskPageBackLink } from '~/src/server/task-list/task-list.helper.js'

export default class CheckResponsesPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.viewName = 'check-responses-page'

    // Resolve section
    if (pageDef.section) {
      this.section = model.getSection(pageDef.section)
    }
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

    const landParcelsDisplay = context.state.landParcelsDisplay

    if (landParcelsDisplay && viewModel.checkAnswers) {
      for (const section of viewModel.checkAnswers) {
        for (const row of section.summaryList.rows) {
          if (row.key?.text === 'Select land parcels') {
            row.value = { text: landParcelsDisplay }
          }
        }
      }
    }

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
