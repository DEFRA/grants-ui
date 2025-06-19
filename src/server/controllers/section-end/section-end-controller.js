import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'

export default class SectionEndController extends SummaryPageController {
  viewName = 'section-end-summary'

  getSummaryViewModel(request, context) {
    const viewModel = super.getSummaryViewModel(request, context)

    if (viewModel.checkAnswers && viewModel.checkAnswers.length > 0) {
      viewModel.checkAnswers = viewModel.checkAnswers[0]
    }

    return viewModel
  }

  makePostRouteHandler() {
    return async (request, context, h) => {
      const data =
        (await request.server.app.cacheTemp.get(request.yar.id)) ?? {}

      const newData = Object.assign(data, {
        [request.app.model.basePath]: context.relevantState
      })

      await request.server.app.cacheTemp.set(request.yar.id, newData)

      const source = request.query.source

      return h.redirect(`/${source}/tasklist`)
    }
  }
}
