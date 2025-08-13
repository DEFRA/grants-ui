import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'

export default class CheckDetailsPageController extends SummaryPageController {
  /**
   * @param {FormModel} model
   * @param {PageSummary} pageDef
   */
  constructor(model, pageDef) {
    super(model, pageDef)
    this.viewName = 'check-details-page'
  }

  makePostRouteHandler() {
    return (request, context, h) => {
      return this.proceed(request, h, this.getNextPath(context))
    }
  }
}
