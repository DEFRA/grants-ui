import { buildRedisClient } from '~/src/server/common/helpers/redis-client.js'
import { config } from '~/src/config/config.js'

// Lazy singleton - separate connection from the session cache client
/** @type {Redis | Cluster | null} */
let _client = null

export function getFormsRedisClient() {
  if (!_client) {
    _client = buildRedisClient(config.get('redis'))
  }
  return _client
}

/**
 * Exposed for testing only.
 * @param {Redis | Cluster | null} client
 */
export function _setFormsRedisClient(client) {
  _client = client
}

export async function closeFormsRedisClient() {
  if (_client) {
    await _client.quit()
    _client = null
  }
}

const KEYS = {
  meta: (/** @type {string} */ slug) => `forms:meta:${slug}`,
  // A Redis SET (deliberately a new key: the legacy `forms:slugs` key holds a
  // JSON-array string, so reusing it would fail with WRONGTYPE — and starting
  // clean drops slugs left over from the removed startup registration).
  slugIndex: 'forms:slug-index'
}

/**
 * @param {Redis | Cluster} redis
 * @param {string} slug
 * @param {FormCacheEntry} entry
 */
export async function setFormMeta(redis, slug, entry) {
  await redis.set(KEYS.meta(slug), JSON.stringify(entry))
}

/**
 * @param {Redis | Cluster} redis
 * @param {string} slug
 * @returns {Promise<FormCacheEntry | null>}
 */
export async function getFormMeta(redis, slug) {
  const raw = await redis.get(KEYS.meta(slug))
  return raw ? JSON.parse(raw) : null
}

/**
 * Adds a slug to the set of known form slugs. SADD is atomic and idempotent,
 * so concurrent registrations across instances cannot lose entries.
 * @param {Redis | Cluster} redis
 * @param {string} slug
 */
export async function registerSlug(redis, slug) {
  await redis.sadd(KEYS.slugIndex, slug)
}

/**
 * All known form slugs, sorted for stable listings.
 * @param {Redis | Cluster} redis
 * @returns {Promise<string[]>}
 */
export async function getAllSlugs(redis) {
  const slugs = await redis.smembers(KEYS.slugIndex)
  return slugs.sort()
}

/**
 * @param {Redis | Cluster} redis
 * @returns {Promise<FormCacheEntry[]>}
 */
export async function getAllFormMetas(redis) {
  const slugs = await getAllSlugs(redis)
  const entries = await Promise.all(slugs.map((slug) => getFormMeta(redis, slug)))
  return /** @type {FormCacheEntry[]} */ (entries.filter(Boolean))
}

/**
 * @import { Redis, Cluster } from 'ioredis'
 */

/**
 * @typedef {object} FormCacheEntry
 * @property {string} id
 * @property {string} slug
 * @property {string} title
 * @property {'backend'} source
 * @property {Record<string, unknown>} [metadata] - Custom metadata from the form definition
 */
