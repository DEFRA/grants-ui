import { SummaryPageController as EngineSummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { formatNumberAnswer, getNumberFormatter } from '~/src/server/common/helpers/number-formatter.js'
import { getNumberDisplayValue } from '~/src/server/common/helpers/number-display-value.js'
export class GrantsSummaryPageController extends EngineSummaryPageController {
  /**
   * @param {import('@defra/forms-engine-plugin/types').FormContextRequest} request
   * @param {import('@defra/forms-engine-plugin/types').FormContext} context
   */
  getSummaryViewModel(request, context) {
    const viewModel = super.getSummaryViewModel(request, context)
    formatSummaryNumberAnswers(viewModel, context)
    return viewModel
  }
}

/**
 * @param {import('@defra/forms-engine-plugin/engine/models/index.js').SummaryViewModel} viewModel
 * @param {import('@defra/forms-engine-plugin/types').FormContext} context
 */
export function formatSummaryNumberAnswers(viewModel, context) {
  const inputs = /** @type {Record<string, string> | undefined} */ (context.state?.$$__numberFieldInputs)

  viewModel?.details?.forEach((detail, sectionIndex) => {
    detail.items?.forEach((item, rowIndex) => {
      const component = /** @type {{ type: string, options?: { format?: string } } | undefined} */ (
        context.componentDefMap?.get(item.name)
      )
      const value = item.state?.[item.name]
      const displayValue =
        component?.type === 'NumberField' && getNumberFormatter(component.options?.format)
          ? getNumberDisplayValue(value, inputs?.[item.name])
          : value
      const formatted = formatNumberAnswer(component, displayValue)
      if (formatted === undefined || formatted === '') {
        return
      }
      item.value = formatted
      const row = viewModel.checkAnswers[sectionIndex].summaryList.rows[rowIndex]
      row.value = { classes: row.value.classes, text: formatted }
    })
  })
}
