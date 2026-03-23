import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { getFormsRedisClient, getFormMeta, getFormDef } from './forms-redis.js'

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
 * Loads a form's full definition — from the YAML file for file-sourced forms, or from Redis
 * for API-sourced forms (lazy re-fetch is handled by the formsService layer).
 * @param {import('./forms-redis.js').FormCacheEntry} form
 * @returns {Promise<import('@defra/forms-model').FormDefinition>}
 */
export async function loadFormDefinition(form) {
  if (form.source === 'yaml') {
    const raw = await readFile(/** @type {string} */ (form.path), 'utf8')
    return parseYaml(raw)
  }

  const redis = getFormsRedisClient()
  const definition = await getFormDef(redis, form.slug)
  if (!definition) {
    throw new Error(`Form definition not found in Redis for slug: ${form.slug}`)
  }
  return definition
}
