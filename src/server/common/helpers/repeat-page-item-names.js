import { RepeatPageController } from '@defra/forms-engine-plugin/controllers/RepeatPageController.js'
import { getPage } from '@defra/forms-engine-plugin/engine/helpers.js'
import pluralize from 'pluralize'

const decoratedPages = new WeakSet()

/**
 * Names repeat items using the form definition. The engine creates its built-in
 * RepeatPageController before consulting custom controllers, so decorate the
 * resolved instance and retain its identity, validation and navigation.
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
 */
export function enableRepeatPageItemNames(request) {
  const { model } = request.app
  if (!model) {
    return
  }

  const page = getPage(model, request)
  if (!(page instanceof RepeatPageController) || decoratedPages.has(page)) {
    return
  }

  const { getListSummaryViewModel, makeGetItemDeleteRouteHandler } = page

  page.getListSummaryViewModel = function (request, context, list) {
    const viewModel = getListSummaryViewModel.call(this, request, context, list)
    const title = this.repeat.options.title.toLowerCase()
    const itemName = (count) => pluralize(title, count)

    viewModel.pageTitle = `You have added ${list.length} ${itemName(list.length)}`
    // Only replace the engine's repeat-limit messages, leaving field errors intact.
    viewModel.errors = viewModel.errors?.map((error) => ({
      ...error,
      text: error.text.replace(
        /^(You (?:can only add up to|must add at least) (\d+)) answers?$/,
        (_match, prefix, count) => `${prefix} ${itemName(Number(count))}`
      )
    }))
    return viewModel
  }

  page.makeGetItemDeleteRouteHandler = function () {
    const handler = makeGetItemDeleteRouteHandler.call(this)
    return (request, context, h) => {
      // The engine has no delete view-model method. Intercept this handler's view
      // without modifying the shared toolkit or duplicating its deletion guards.
      const toolkit = Object.create(h)
      toolkit.view = (viewName, viewModel, options) =>
        h.view(
          viewName,
          {
            ...viewModel,
            pageTitle: `Are you sure you want to remove this ${this.repeat.options.title.toLowerCase()}?`
          },
          options
        )
      return handler(request, context, toolkit)
    }
  }

  decoratedPages.add(page)
}
