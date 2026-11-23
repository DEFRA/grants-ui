import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'
import { getNumberFormatter } from '../helpers/number-formatter.js'

/**
 * @param {import('@defra/forms-model').FormDefinition} definition
 */
export function validateNumberFormats(definition) {
  for (const page of definition.pages ?? []) {
    if ('components' in page) {
      validateComponents(page.components)
    }
    const config = /** @type {{ config?: { additionalSections?: AdditionalSection[] } }} */ (page).config
    validateAdditionalSections(config?.additionalSections, page.path)
  }
  const pageConfig = /** @type {Record<string, { additionalSections?: AdditionalSection[] }> | undefined} */ (
    definition.metadata?.pageConfig
  )
  for (const [path, config] of Object.entries(pageConfig ?? {})) {
    validateAdditionalSections(config?.additionalSections, path)
  }
  for (const list of definition.lists ?? []) {
    validateItems(list.items)
  }
}

/**
 * @param {AdditionalSection[] | undefined} sections
 * @param {string} path
 */
function validateAdditionalSections(sections, path) {
  if (!Array.isArray(sections)) {
    return
  }
  for (const section of sections) {
    for (const item of section.items ?? []) {
      if (item.format !== undefined && !getNumberFormatter(item.format)) {
        throw new SystemError({
          message: `Invalid display formatting for additional answer ${item.stateValue} on page ${path}`,
          source: 'validateNumberFormats',
          reason: 'additionalSections items[].format must be a supported number formatter',
          status: 500
        })
      }
    }
  }
}

/**
 * @param {any[] | undefined} components
 */
function validateComponents(components) {
  for (const component of components ?? []) {
    if (requiresComponentValidation(component) && !isFormatableNumberField(component)) {
      throw new SystemError({
        message: `Invalid display formatting for component ${component.name}`,
        source: 'validateNumberFormats',
        reason:
          'options.format must be a supported number formatter on a NumberField; schema.format and top-level format are not supported',
        status: 500
      })
    }
    validateItems(component.items)
  }
}

/**
 * @param {any} component
 */
function requiresComponentValidation(component) {
  return (
    component.format !== undefined ||
    component.schema?.format !== undefined ||
    (component.type !== 'TelephoneNumberField' && component.options?.format !== undefined)
  )
}

/**
 * @param {any} field
 * @returns {boolean}
 */
function isFormatableNumberField(field) {
  return (
    field.type === 'NumberField' &&
    field.format === undefined &&
    field.schema?.format === undefined &&
    Boolean(getNumberFormatter(field.options?.format))
  )
}

/**
 * @param {any[] | undefined} items
 */
function validateItems(items) {
  for (const item of items ?? []) {
    validateComponents(item.conditional?.components)
  }
}

/** @import { AdditionalSection } from '../helpers/additional-answers.js' */
