import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

/**
 * @param {import('@defra/forms-model').FormDefinition} definition
 */
export function validateNumberFormats(definition) {
  for (const page of definition.pages ?? []) {
    if ('components' in page) {
      validateComponents(page.components)
    }
  }
  for (const list of definition.lists ?? []) {
    validateItems(list.items)
  }
}

/** @param {any[] | undefined} components */
function validateComponents(components) {
  for (const component of components ?? []) {
    if (component.format !== undefined && (component.type !== 'NumberField' || component.format !== 'thousands')) {
      throw new SystemError({
        message: `Invalid playback format for component '${component.name}'`,
        source: 'validateNumberFormats',
        reason: 'format must be thousands and can only be configured on a NumberField',
        status: 500
      })
    }
    validateItems(component.items)
  }
}

/** @param {any[] | undefined} items */
function validateItems(items) {
  for (const item of items ?? []) {
    validateComponents(item.conditional?.components)
  }
}
