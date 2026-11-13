import { RepeatPageController } from '@defra/forms-engine-plugin/controllers/RepeatPageController.js'
import { getPage } from '@defra/forms-engine-plugin/engine/helpers.js'
import { formatNumberAnswer, getNumberFormatter } from './number-formatter.js'
import { getNumberDisplayValue } from './number-display-value.js'
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
      const value = item[field.name]
      const displayValue =
        component?.type === 'NumberField' && getNumberFormatter(component.options?.format)
          ? getNumberDisplayValue(value, inputs?.[field.name])
          : value
      const formatted = formatNumberAnswer(component, displayValue)
      if (formatted !== undefined) {
        rows[index].value = { ...rows[index].value, text: formatted || 'Not provided' }
      }
    })
    return viewModel
  }
  decoratedPages.add(page)
}
