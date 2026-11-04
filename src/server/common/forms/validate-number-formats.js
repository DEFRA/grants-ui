import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'
import { isNumberFormat } from '../helpers/number-field-format.js'

/**
 * @param {import('@defra/forms-model').FormDefinition} definition
 */
export function validateNumberFormats(definition) {
  for (const page of definition.pages ?? []) {
    if ('components' in page) {
      validateComponents(page.components, !('repeat' in page))
    }
  }
  for (const list of definition.lists ?? []) {
    validateItems(list.items)
  }
}

/**
 * @param {any[] | undefined} components
 * @param {boolean} allowFormat
 */
function validateComponents(components, allowFormat) {
  for (const component of components ?? []) {
    if (
      component.format !== undefined &&
      (!allowFormat || component.type !== 'NumberField' || !isNumberFormat(component.format))
    ) {
      throw new SystemError({
        message: `Invalid playback format for component '${component.name}'`,
        source: 'validateNumberFormats',
        reason: 'format must be a valid number formatter pipeline on a NumberField on a non-repeating page',
        status: 500
      })
    }
    validateItems(component.items, allowFormat)
  }
}

/**
 * @param {any[] | undefined} items
 * @param {boolean} [allowFormat]
 */
function validateItems(items, allowFormat = true) {
  for (const item of items ?? []) {
    validateComponents(item.conditional?.components, allowFormat)
  }
}
