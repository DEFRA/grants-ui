import { getFormsRedisClient, getAllSlugs } from '../../common/forms/services/forms-redis.js'

/**
 * Get available form slugs as a list
 * @returns {Promise<string[]>}
 */
export async function getAvailableFormSlugs() {
  return getAllSlugs(getFormsRedisClient())
}
