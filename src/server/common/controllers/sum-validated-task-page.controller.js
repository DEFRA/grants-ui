import TaskPageController from '~/src/server/task-list/task-page.controller.js'

/**
 * @typedef {object} SumValidationRule
 * @property {string} fieldName - The field on the current page being validated
 * @property {string[]} sumFields - Fields to sum (from payload or state)
 * @property {string} maxField - State field containing the maximum allowed total
 * @property {(remaining: number) => string} errorText - Returns the validation error message
 */

/**
 * Creates a TaskPageController that validates the sum of numeric fields
 * does not exceed a maximum field value on POST.
 *
 * @param {Record<string, SumValidationRule>} rules - Validation rules keyed by page path
 * @returns {typeof TaskPageController} A controller class with sum validation
 */
export function createSumValidatedController(rules) {
  return class SumValidatedTaskPageController extends TaskPageController {
    makePostRouteHandler() {
      const parentHandler = super.makePostRouteHandler()

      return async (request, context, h) => {
        const rule = rules[this.pageDef.path]

        if (rule) {
          const { state } = context
          const payload = request.payload ?? {}

          const max = Number(state[rule.maxField]) || 0
          const sum = rule.sumFields.reduce((acc, field) => acc + (Number(payload[field] ?? state[field]) || 0), 0)

          if (sum > max) {
            const otherFieldsSum = rule.sumFields
              .filter((f) => f !== rule.fieldName)
              .reduce((acc, field) => acc + (Number(state[field]) || 0), 0)
            const remaining = max - otherFieldsSum

            context.errors = [
              {
                path: [rule.fieldName],
                href: `#${rule.fieldName}`,
                name: rule.fieldName,
                text: rule.errorText(remaining)
              }
            ]
          }
        }

        return parentHandler(request, context, h)
      }
    }
  }
}
