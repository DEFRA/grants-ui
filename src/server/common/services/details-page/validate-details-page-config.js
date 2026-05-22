import { normaliseResponseMappingPath } from '~/src/server/common/helpers/path-utils.js'

/**
 * @typedef {object} QueryFieldConfig
 * @property {string} path
 * @property {QueryFieldConfig[]} [fields]
 */
/**
 * @typedef {object} QueryEntityConfig
 * @property {string} name
 * @property {QueryFieldConfig[]} fields
 */
/**
 * @typedef {object} DisplayFieldConfig
 * @property {string} [sourcePath]
 * @property {string} [sourceType]
 */
/**
 * @typedef {object} DisplaySectionConfig
 * @property {DisplayFieldConfig[]} [fields]
 */
/**
 * @typedef {object} DetailsPageConfig
 * @property {{ entities: QueryEntityConfig[] }} [query]
 * @property {Record<string, string>} [responseMapping]
 * @property {DisplaySectionConfig[]} [displaySections]
 * @property {boolean} [validateCoverage]
 */

/**
 * Resolves all individual field paths requested from the DAL by traversing the
 * nested query entity structure down to fields that have no further children.
 * For example, a query for business > info > email > address produces `business.info.email.address`.
 * @param {QueryEntityConfig[]} entities
 * @returns {Set<string>}
 */
function collectQueriedFieldPaths(entities) {
  const queriedFields = new Set()

  /** @param {QueryFieldConfig} field @param {string} currentPath */
  function collectFields(field, currentPath) {
    if (Array.isArray(field.fields) && field.fields.length > 0) {
      for (const child of field.fields) {
        collectFields(child, `${currentPath}.${child.path}`)
      }
    } else {
      queriedFields.add(currentPath)
    }
  }

  for (const entity of entities ?? []) {
    for (const field of entity.fields ?? []) {
      collectFields(field, `${entity.name}.${field.path}`)
    }
  }

  return queriedFields
}

/**
 * Translates a queried field path (e.g. `business.info.email.address`) into the
 * display key used in sourcePaths (e.g. `business.email.address`) by applying
 * the responseMapping. Uses the longest matching mapping entry to ensure the
 * most specific translation is applied.
 * @param {string} queriedField
 * @param {Record<string, string>} responseMapping
 * @returns {string}
 */
function toDisplayPath(queriedField, responseMapping) {
  let best = null
  for (const [displayKey, rawValue] of Object.entries(responseMapping)) {
    const mappedPath = normaliseResponseMappingPath(rawValue)
    const matches = queriedField === mappedPath || queriedField.startsWith(`${mappedPath}.`)
    if (matches && (!best || mappedPath.length > best.mappedPath.length)) {
      best = { displayKey, mappedPath }
    }
  }
  if (!best) {
    return queriedField
  }
  if (queriedField === best.mappedPath) {
    return best.displayKey
  }
  return best.displayKey + queriedField.slice(best.mappedPath.length)
}

/**
 * Translates all queried field paths into the display keys used in sourcePaths.
 * @param {QueryEntityConfig[]} entities
 * @param {Record<string, string>} responseMapping
 * @returns {Set<string>}
 */
function collectDisplayablePaths(entities, responseMapping) {
  const displayPaths = new Set()
  for (const queriedField of collectQueriedFieldPaths(entities)) {
    displayPaths.add(toDisplayPath(queriedField, responseMapping))
  }
  return displayPaths
}

/**
 * Collects the sourcePaths configured in displaySections, excluding fields
 * sourced from credentials (those come from the auth token, not the DAL).
 * @param {DisplaySectionConfig[]} displaySections
 * @returns {Set<string>}
 */
function collectConfiguredSourcePaths(displaySections) {
  const sourcePaths = new Set()
  for (const section of displaySections) {
    for (const field of section.fields ?? []) {
      if (field.sourceType === 'credentials') {
        continue
      }
      if (typeof field.sourcePath === 'string' && field.sourcePath.length > 0) {
        sourcePaths.add(field.sourcePath)
      }
    }
  }
  return sourcePaths
}

/**
 * Validates that every field requested from the DAL is covered by at least one
 * sourcePath in displaySections. A sourcePath covers a field if it matches exactly
 * or is a parent path (e.g. `business.address` covers `business.address.city`),
 * which allows formatters like `address` to account for multiple sub-fields at once.
 * No-op when the form has no detailsPage config.
 * @param {DetailsPageConfig | undefined} detailsPage
 * @param {string} [formName]
 */
export function validateDetailsPageConfig(detailsPage, formName = 'unnamed') {
  if (!detailsPage?.query || !detailsPage.displaySections || !detailsPage.validateCoverage) {
    return
  }

  const displayablePaths = collectDisplayablePaths(detailsPage.query.entities, detailsPage.responseMapping ?? {})
  const configuredSourcePaths = collectConfiguredSourcePaths(detailsPage.displaySections)

  const fieldsNotDisplayed = [...displayablePaths]
    .filter((field) => ![...configuredSourcePaths].some((sp) => field === sp || field.startsWith(`${sp}.`)))
    .sort((a, b) => a.localeCompare(b))

  if (fieldsNotDisplayed.length > 0) {
    throw new Error(
      `Invalid detailsPage configuration in form ${formName}: queried but not displayed: ${fieldsNotDisplayed.join(', ')}`
    )
  }
}
