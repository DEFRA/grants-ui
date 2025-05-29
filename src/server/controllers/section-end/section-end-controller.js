import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'

export default class SectionEndController extends SummaryPageController {
  viewName = 'section-end-summary'

  makePostRouteHandler() {
    return async (request, context, h) => {
      const data =
        (await request.server.app.cacheTemp.get(request.yar.id)) ?? {}

      const newData = Object.assign(data, {
        [request.app.model.basePath]: context.relevantState
      })

      await request.server.app.cacheTemp.set(request.yar.id, newData)

      return h.redirect('/adding-value-tasklist')
    }
  }
}
