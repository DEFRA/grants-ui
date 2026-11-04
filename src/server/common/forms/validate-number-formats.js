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
    const format = component.schema?.format
    if (
      component.format !== undefined ||
      (format !== undefined && (!allowFormat || component.type !== 'NumberField' || !isNumberFormat(format)))
    ) {
      throw new SystemError({
        message: `Invalid playback format for component '${component.name}'`,
        source: 'validateNumberFormats',
        reason:
          'schema.format must be a supported number formatter on a NumberField on a non-repeating page; top-level format is not supported',
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
