import { resolvePath } from './path-utils.js'

/**
 * @typedef {{ title: string, stateValue: string }} AdditionalSectionItem
 * @typedef {object} AdditionalSection
 * @property {string} [title] - Separate section heading; omit to use the owning page's section
 * @property {string} [page] - Owning page path, also used to filter excluded pages
 * @property {AdditionalSectionItem[]} [items] - Saved values to display
 */

/** @param {string | undefined} path */
export function normalisePagePath(path) {
  return path?.replace(/^\//, '')
}

/**
 * @template {{ path?: string }} T
 * @param {T[] | undefined} pages
 * @param {string} path - Page path with or without a leading slash
 * @returns {T | undefined}
 */
export function findPageByPath(pages, path) {
  return pages?.find((page) => normalisePagePath(page.path) === normalisePagePath(path))
}

/**
 * Resolves configured additional answers without calculating or changing state.
 * Callers place the sections and adapt the values to their own view models.
 * @param {AdditionalSection[] | undefined} additionalSections
 * @param {Record<string, unknown>} state
 * @param {object} [options]
 * @param {{ path: string }[]} [options.relevantPages] - Omit to include all configured pages
 * @param {Set<string>} [options.excludedStateValues] - Values already displayed elsewhere
 */
export function resolveAdditionalAnswerSections(
  additionalSections,
  state,
  { relevantPages, excludedStateValues = new Set() } = {}
) {
  if (!Array.isArray(additionalSections)) {
    return []
  }

  const relevantPaths = relevantPages && new Set(relevantPages.map((page) => normalisePagePath(page.path)))

  return additionalSections.flatMap((section) => {
    if (section.page && relevantPaths && !relevantPaths.has(normalisePagePath(section.page))) {
      return []
    }

    const configuredItems = section.items ?? []
    const items = configuredItems.filter(({ stateValue }) => !excludedStateValues.has(stateValue))
    if (configuredItems.length > 0 && items.length === 0) {
      return []
    }

    return [
      {
        ...section,
        items: items.map((item) => ({ ...item, value: resolvePath(state, item.stateValue) ?? 'Not provided' }))
      }
    ]
  })
}
