import { RepeatPageController } from '@defra/forms-engine-plugin/controllers/RepeatPageController.js'
import { getPage, proceed, redirectPath } from '@defra/forms-engine-plugin/engine/helpers.js'
import { applyTaskPageViewModel, getTaskListPath, getTaskPageNextPath } from './task-list.helper.js'

const decoratedPages = new WeakSet()

/**
 * Adds task behaviour to the resolved repeat page without changing its engine
 * identity or wrapping a cached controller more than once.
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
 */
export function enableRepeatTaskContext(request) {
  const { model } = request.app
  if (!model || !getTaskListPath(model)) {
    return
  }

  const page = getPage(model, request)
  if (!(page instanceof RepeatPageController) || !page.pageDef.section || decoratedPages.has(page)) {
    return
  }

  const { getViewModel, getListSummaryViewModel, makePostListSummaryRouteHandler, makeGetItemDeleteRouteHandler } = page

  page.getViewModel = function (request, context) {
    const viewModel = getViewModel.call(this, request, context)
    const taskViewModel = applyTaskPageViewModel(viewModel, this.pageDef, !!request.query.returnUrl)
    if (this.getItemId(request) && (this.getListFromState(context.state).length || request.query.returnUrl)) {
      taskViewModel.backLink = {
        href: getRepeatListHref(this, request),
        text: `Go back to ${this.repeat.options.title.toLowerCase()} list`
      }
    }
    return taskViewModel
  }

  page.getListSummaryViewModel = function (request, context, list) {
    const viewModel = getListSummaryViewModel.call(this, request, context, list)
    const returnUrl = getRepeatListHref(this, request)
    const actions = viewModel.checkAnswers
      .flatMap((section) => section.summaryList.rows)
      .flatMap((row) => row.actions?.items ?? [])
    for (const action of actions) {
      action.href = redirectPath(action.href, { returnUrl })
    }
    return applyTaskPageViewModel(viewModel, this.pageDef, !!request.query.returnUrl)
  }

  page.proceed = function (request, h) {
    // Item saves and delete confirmations return to the list first. Its own
    // returnUrl retains the eventual destination (for example Check answers).
    const listHref = getRepeatListHref(this, request)
    return proceed(
      { method: request.method, payload: request.payload, query: { ...request.query, returnUrl: listHref } },
      h,
      listHref
    )
  }

  page.makeGetItemDeleteRouteHandler = function () {
    const deletePage = Object.create(this)
    deletePage.getBackLink = (request) => ({ href: getRepeatListHref(this, request), text: 'Back' })
    return makeGetItemDeleteRouteHandler.call(deletePage)
  }

  page.makePostListSummaryRouteHandler = function () {
    // The engine calls super.proceed() directly for summary Continue. Use a
    // handler-local receiver so only that handler's next path is task-aware;
    // the model's journey walk and concurrent requests keep the original method.
    const summaryPage = Object.create(this)
    summaryPage.getNextPath = (context) => getTaskPageNextPath(this, this.getNextPath(context))
    return makePostListSummaryRouteHandler.call(summaryPage)
  }

  decoratedPages.add(page)
}

/**
 * Keeps the list's onward destination inside its URL without nesting it again
 * when an item action already carries that list URL as its returnUrl.
 * @param {RepeatPageController} page
 * @param {import('@defra/forms-engine-plugin/types').FormContextRequest} request
 * @returns {string}
 */
function getRepeatListHref(page, request) {
  const listHref = page.getHref(`${page.path}${page.getSummaryPath()}`)
  const { returnUrl } = request.query
  if (returnUrl === listHref || returnUrl?.startsWith(`${listHref}?`)) {
    return returnUrl
  }
  return redirectPath(listHref, { returnUrl })
}
