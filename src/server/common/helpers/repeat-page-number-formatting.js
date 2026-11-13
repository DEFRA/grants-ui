import { RepeatPageController } from '@defra/forms-engine-plugin/controllers/RepeatPageController.js'
import { getPage } from '@defra/forms-engine-plugin/engine/helpers.js'
import { formatNumberAnswer } from './number-formatter.js'
import { getNumberFieldInputs } from './state/persist-formatting.js'

const decoratedPages = new WeakSet()

/**
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} formRequest
 */
export function enableRepeatNumberFormatting(formRequest) {
  const { model } = formRequest.app
  if (!model) {
    return
  }
  const page = getPage(model, formRequest)
  if (!(page instanceof RepeatPageController) || decoratedPages.has(page)) {
    return
  }

  const { getListSummaryViewModel } = page
  page.getListSummaryViewModel = function (request, context, list) {
    const viewModel = getListSummaryViewModel.call(this, request, context, list)
    // The engine uses the first field as the item's label on the repeat list.
    const field = this.collection.fields[0]
    if (!field) {
      return viewModel
    }
    const component = /** @type {{ type: string, options?: { format?: string } } | undefined} */ (
      context.componentDefMap.get(field.name)
    )
    const rows = viewModel.checkAnswers[0].summaryList.rows
    list.forEach((item, index) => {
      const inputs = getNumberFieldInputs(context.state, this.repeat.options.name, item.itemId)
      const formatted = formatNumberAnswer(component, item[field.name], inputs?.[field.name])
      if (formatted !== undefined) {
        rows[index].value = { ...rows[index].value, text: formatted || 'Not provided' }
      }
    })
    return viewModel
  }
  decoratedPages.add(page)
}
