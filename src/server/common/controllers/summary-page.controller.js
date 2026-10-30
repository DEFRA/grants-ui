import { SummaryPageController as EngineSummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { formatNumberAnswer } from '~/src/server/common/helpers/number-field-format.js'

export class GrantsSummaryPageController extends EngineSummaryPageController {
  /**
   * @param {import('@defra/forms-engine-plugin/types').FormContextRequest} request
   * @param {import('@defra/forms-engine-plugin/types').FormContext} context
   */
  getSummaryViewModel(request, context) {
    const viewModel = super.getSummaryViewModel(request, context)
    const inputs = /** @type {Record<string, string> | undefined} */ (context.state?.$$__numberFieldInputs)

    viewModel?.details?.forEach((detail, sectionIndex) => {
      detail.items?.forEach((item, rowIndex) => {
        const component = /** @type {{ type: string, format?: string } | undefined} */ (
          this.model?.componentDefMap?.get(item.name)
        )
        const value = item.state?.[item.name]
        if (
          component?.type !== 'NumberField' ||
          component.format !== 'thousands' ||
          value === null ||
          value === undefined ||
          value === ''
        ) {
          return
        }
        const formatted = formatNumberAnswer(component, value, inputs?.[item.name])
        item.value = formatted
        const row = viewModel.checkAnswers[sectionIndex].summaryList.rows[rowIndex]
        row.value = { classes: row.value.classes, text: formatted }
      })
    })

    return viewModel
  }
}
