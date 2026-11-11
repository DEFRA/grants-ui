/** Where a grant lists the business's applications, below the grant slug. */
export const APPLICATIONS_PATH = '/applications'

/**
 * @param {string} slug
 * @returns {string}
 */
export function applicationsSelectorPath(slug) {
  return `/${slug}${APPLICATIONS_PATH}`
}
