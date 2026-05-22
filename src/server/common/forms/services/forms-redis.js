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
  def: (/** @type {string} */ slug) => `forms:def:${slug}`,
  reverse: (/** @type {string} */ id) => `forms:reverse:${id}`,
  slugs: 'forms:slugs'
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
 * @param {Redis | Cluster} redis
 * @param {string} slug
 * @param {FormDefinition} definition
 * @param {number} [ttlSeconds] - omit for no TTL (YAML forms)
 */
export async function setFormDef(redis, slug, definition, ttlSeconds) {
  const serialised = JSON.stringify(definition)
  if (ttlSeconds) {
    await redis.set(KEYS.def(slug), serialised, 'EX', ttlSeconds)
  } else {
    await redis.set(KEYS.def(slug), serialised)
  }
}

/**
 * @param {Redis | Cluster} redis
 * @param {string} slug
 * @returns {Promise<FormDefinition | null>}
 */
export async function getFormDef(redis, slug) {
  const raw = await redis.get(KEYS.def(slug))
  return raw ? JSON.parse(raw) : null
}

/**
 * @param {Redis | Cluster} redis
 * @param {string} id
 * @param {string} slug
 */
export async function setSlugReverse(redis, id, slug) {
  await redis.set(KEYS.reverse(id), slug)
}

/**
 * @param {Redis | Cluster} redis
 * @param {string} id
 * @returns {Promise<string | null>}
 */
export async function getSlugByFormId(redis, id) {
  return redis.get(KEYS.reverse(id))
}

/**
 * @param {Redis | Cluster} redis
 * @param {string[]} slugs
 */
export async function setAllSlugs(redis, slugs) {
  await redis.set(KEYS.slugs, JSON.stringify(slugs))
}

/**
 * @param {Redis | Cluster} redis
 * @returns {Promise<string[]>}
 */
export async function getAllSlugs(redis) {
  const raw = await redis.get(KEYS.slugs)
  return raw ? JSON.parse(raw) : []
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
 * @import { FormDefinition } from '@defra/forms-model'
 */

/**
 * @typedef {object} FormCacheEntry
 * @property {string} id
 * @property {string} slug
 * @property {string} title
 * @property {'yaml' | 'api'} source
 * @property {string} [path] - Absolute path to the YAML file; only present for source='yaml' forms
 * @property {Record<string, unknown>} [metadata] - Custom metadata from the form definition
 */
