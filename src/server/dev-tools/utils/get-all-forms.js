import { getFormsCache } from '../../common/forms/services/form.js'

/**
 * Get all forms from cache with metadata
 * @returns {Array} Array of form objects
 */
export function getAllForms() {
  return getFormsCache()
}
