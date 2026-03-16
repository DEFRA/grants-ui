import { getFormsCache } from './form.js'

/**
 * Finds a cached form entry by its slug.
 * @param {string} slug
 * @returns {{ title: string, path: string, slug: string, id: string } | null}
 */
export function findFormBySlug(slug) {
  const allForms = getFormsCache()
  return allForms.find((f) => f.slug === slug) || null
}
