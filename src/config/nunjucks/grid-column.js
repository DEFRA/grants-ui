/**
 * Maps the per-page `width` config option (hoisted onto
 * `definition.metadata.pageConfig[path]`) to the GOV.UK grid column class used
 * for the first column inside `main` on a form page.
 *
 * Supported `width` values (set via a page's `config:` block in the form
 * definition):
 *   - `two-thirds`     -> govuk-grid-column-two-thirds (default)
 *   - `three-quarters` -> govuk-grid-column-three-quarters-from-desktop
 *   - `full`           -> govuk-grid-column-full
 */
export const GRID_COLUMN_CLASSES = {
  'two-thirds': 'govuk-grid-column-two-thirds',
  'three-quarters': 'govuk-grid-column-three-quarters-from-desktop',
  full: 'govuk-grid-column-full'
}

export const DEFAULT_GRID_COLUMN_CLASS = GRID_COLUMN_CLASSES['two-thirds']

/**
 * Resolve a `width` config value to its grid column class, falling back to the
 * standard two-thirds column for missing or unrecognised values.
 * @param {string} [width]
 * @returns {string}
 */
export function widthToGridColumnClass(width) {
  return GRID_COLUMN_CLASSES[/** @type {keyof typeof GRID_COLUMN_CLASSES} */ (width)] ?? DEFAULT_GRID_COLUMN_CLASS
}

/**
 * Resolve the grid column class for a forms-engine page controller by reading
 * the hoisted per-page config at `metadata.pageConfig[path].width`.
 *
 * A configured `width` only takes effect when it is one of the supported
 * keywords (`two-thirds`, `three-quarters`, `full`); otherwise the template's
 * `defaultFallback` is used. `defaultFallback` may itself be a supported
 * keyword (mapped to its class) or a literal grid column class returned as-is,
 * so templates with a bespoke default (e.g. a responsive `-from-desktop`
 * column) keep their current layout while remaining configurable.
 *
 * Safe to call for any template: when the page, its definition, or the config
 * is missing it falls back to `defaultFallback` (two-thirds by default).
 * @param {{ path?: string, def?: { metadata?: { pageConfig?: Record<string, { width?: string }> } } }} [page]
 * @param {string} [defaultFallback] width keyword or literal class used when the page has no valid `width` config
 * @returns {string}
 */
export function gridColumnClass(page, defaultFallback = 'two-thirds') {
  const path = page?.path
  const width = path ? page?.def?.metadata?.pageConfig?.[path]?.width : undefined
  const configuredClass = GRID_COLUMN_CLASSES[/** @type {keyof typeof GRID_COLUMN_CLASSES} */ (width)]
  if (configuredClass) {
    return configuredClass
  }
  const fallbackKeywordClass = GRID_COLUMN_CLASSES[/** @type {keyof typeof GRID_COLUMN_CLASSES} */ (defaultFallback)]
  return fallbackKeywordClass ?? defaultFallback ?? DEFAULT_GRID_COLUMN_CLASS
}
