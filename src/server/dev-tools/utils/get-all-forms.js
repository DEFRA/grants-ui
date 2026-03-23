import { getFormsRedisClient, getAllFormMetas } from '../../common/forms/services/forms-redis.js'

/**
 * Get all forms from cache with metadata
 * @returns {Promise<import('../../common/forms/services/forms-redis.js').FormCacheEntry[]>}
 */
export async function getAllForms() {
  return getAllFormMetas(getFormsRedisClient())
}
