import { getFormsCache } from '../../common/forms/services/form.js'

/**
 * Get available form slugs as a list
 * @returns {Array<string>} Array of form slugs
 */
export function getAvailableFormSlugs() {
  return getFormsCache().map((f) => f.slug)
}
