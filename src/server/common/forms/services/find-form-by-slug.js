import { getFormMeta, getFormsRedisClient } from './forms-redis.js'

/**
 * Finds a cached form entry by its slug.
 * @param {string} slug
 * @returns {Promise<import('./forms-redis.js').FormCacheEntry | null>}
 */
export async function findFormBySlug(slug) {
  const redis = getFormsRedisClient()
  return getFormMeta(redis, slug)
}

/**
 * Loads a form's full definition from the request-scoped combined backend
 * response (resolved via the formsService layer).
 * @param {import('./forms-redis.js').FormCacheEntry} form
 * @param {FormsServiceWithSlugLookup} formsService
 * @returns {Promise<import('@defra/forms-model').FormDefinition>}
 */
export async function loadFormDefinition(form, formsService) {
  return formsService.getFormDefinitionBySlug(form.slug)
}

/**
 * @typedef {import('@defra/forms-model').FormDefinition} FormDefinition
 * @typedef {{ getFormDefinitionBySlug: (slug: string) => Promise<FormDefinition> }} FormsServiceWithSlugLookup
 */
