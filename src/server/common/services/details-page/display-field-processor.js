/**
 * Processes display field configuration to generate GOV.UK Summary List rows
 */

import { resolvePath } from '~/src/server/common/helpers/path-utils.js'
import { getFormatter } from './formatters/index.js'

/**
 * @typedef {object} DisplayFieldConfig
 * @property {string} label - The label shown in the summary list key
 * @property {string} [sourcePath] - Dot-notation path to the value in mapped data
 * @property {string[]} [sourcePaths] - Multiple paths for multi-value fields
 * @property {string} [sourceType] - "data" (default) or "credentials"
 * @property {string} [format] - Formatter name: "text", "fullName", "address", "contactDetails"
 * @property {boolean} [hideIfEmpty] - If true (default), row is hidden when value is empty
 */

/**
 * @typedef {object} SectionConfig
 * @property {string} title - The section heading text
 * @property {string} [description] - Optional description text shown below heading
 * @property {DisplayFieldConfig[]} fields - Array of field configurations for this section
 */

/**
 * @typedef {object} ProcessedSection
 * @property {{ text: string }} title - The section title
 * @property {string} [description] - Optional description text
 * @property {{ rows: SummaryListRow[] }} summaryList - The summary list for this section
 */

/**
 * @typedef {object} SummaryListRow
 * @property {{ text: string }} key - The row key
 * @property {{ text?: string, html?: string }} value - The row value
 */

/**
 * Resolves the value for a display field from the appropriate source
 * @param {DisplayFieldConfig} fieldConfig - The field configuration
 * @param {object} mappedData - The mapped API response data
 * @param {object} request - The Hapi request object
 * @returns {*} The resolved value
 */
function resolveFieldValue(fieldConfig, mappedData, request) {
  const sourceType = fieldConfig.sourceType || 'data'
  const source = sourceType === 'credentials' ? request.auth?.credentials : mappedData

  if (fieldConfig.sourcePaths) {
    return fieldConfig.sourcePaths.map((path) => resolvePath(source, path ?? ''))
  }

  return resolvePath(source, fieldConfig.sourcePath ?? '')
}

/**
 * Processes a single display field config into a summary list row
 * @param {DisplayFieldConfig} fieldConfig - The field configuration
 * @param {object} mappedData - The mapped API response data
 * @param {object} request - The Hapi request object
 * @returns {SummaryListRow | null} The summary list row, or null if empty and hideIfEmpty is true
 */
function processField(fieldConfig, mappedData, request) {
  const value = resolveFieldValue(fieldConfig, mappedData, request)
  const formatter = getFormatter(fieldConfig.format ?? 'text')
  const formattedValue = formatter(value)

  const hideIfEmpty = fieldConfig.hideIfEmpty !== false

  if (!formattedValue && hideIfEmpty) {
    return null
  }

  return {
    key: { text: fieldConfig.label },
    value: formattedValue || { text: '' }
  }
}

/**
 * Processes display fields configuration to generate GOV.UK Summary List rows
 * @param {DisplayFieldConfig[]} displayFieldsConfig - Array of display field configurations
 * @param {object} mappedData - The mapped API response data
 * @param {object} request - The Hapi request object
 * @returns {{ rows: SummaryListRow[] }} Summary list object with rows array
 */
export function processDisplayFields(displayFieldsConfig, mappedData, request) {
  if (!Array.isArray(displayFieldsConfig)) {
    return { rows: [] }
  }

  const rows = /** @type {SummaryListRow[]} */ (
    displayFieldsConfig.map((fieldConfig) => processField(fieldConfig, mappedData, request)).filter(Boolean)
  )

  return { rows }
}

/**
 * Processes section configuration to generate array of sections with summary lists
 * @param {SectionConfig[]} sectionsConfig - Array of section configurations
 * @param {object} mappedData - The mapped API response data
 * @param {object} request - The Hapi request object
 * @returns {ProcessedSection[]} Array of processed sections
 */
export function processSections(sectionsConfig, mappedData, request) {
  if (!Array.isArray(sectionsConfig)) {
    return []
  }

  return /** @type {ProcessedSection[]} */ (
    sectionsConfig
      .map((section) => {
        const { rows } = processDisplayFields(section.fields || [], mappedData, request)

        if (rows.length === 0) {
          return null
        }

        return {
          title: { text: section.title },
          ...(section.description && { description: section.description }),
          summaryList: { rows }
        }
      })
      .filter(Boolean)
  )
}
