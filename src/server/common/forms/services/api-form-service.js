import jwt from 'jsonwebtoken'
import { logger } from '~/src/server/common/helpers/logging/log.js'
import { getFormDef, setFormDef, setFormMeta, setSlugReverse } from './forms-redis.js'

export class ApiFormService {
  /**
   * @param {string} apiUrl
   * @param {string} jwtSecret
   * @param {string} jwtExpiry
   * @param {number} cacheTtlSeconds
   */
  constructor(apiUrl, jwtSecret, jwtExpiry, cacheTtlSeconds) {
    this.apiUrl = apiUrl
    this.jwtSecret = jwtSecret
    this.jwtExpiry = jwtExpiry
    this.cacheTtlSeconds = cacheTtlSeconds
  }

  generateJwt() {
    return jwt.sign({ sub: 'grants-ui' }, this.jwtSecret, { expiresIn: this.jwtExpiry })
  }

  /**
   * @param {string} path
   * @returns {Promise<unknown>}
   */
  async apiFetch(path) {
    const token = this.generateJwt()
    const url = `${this.apiUrl}${path}`
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!response.ok) {
      throw new Error(`Config API request failed: ${response.status} ${response.statusText} — ${url}`)
    }
    return response.json()
  }

  /**
   * @param {string} slug
   * @returns {Promise<import('~/src/server/common/forms/services/forms-redis.js').FormCacheEntry>}
   */
  async fetchFormMetadata(slug) {
    /** @type {import('@defra/forms-model').FormMetadataInput & { id: string; slug: string }} */
    const apiMeta = /** @type {any} */ (await this.apiFetch(`/forms/slug/${slug}`))
    return {
      id: apiMeta.id,
      slug: apiMeta.slug,
      title: apiMeta.title,
      source: 'api'
    }
  }

  /**
   * @param {string} slug
   * @returns {Promise<import('@defra/forms-model').FormDefinition>}
   */
  async fetchFormDefinition(slug) {
    return /** @type {Promise<import('@defra/forms-model').FormDefinition>} */ (
      this.apiFetch(`/forms/slug/${slug}/definition`)
    )
  }

  /**
   * Fetch the definition from the Config API, store it in Redis with TTL, and return it.
   * @param {import('ioredis').Redis | import('ioredis').Cluster} redis
   * @param {string} slug
   * @param {(definition: import('@defra/forms-model').FormDefinition) => import('@defra/forms-model').FormDefinition} configureDefinition
   * @returns {Promise<import('@defra/forms-model').FormDefinition>}
   */
  async fetchAndCacheDefinition(redis, slug, configureDefinition) {
    logger.info(`Re-fetching form definition from Config API for slug: ${slug}`)
    const rawDefinition = await this.fetchFormDefinition(slug)
    const definition = configureDefinition(rawDefinition)
    await setFormDef(redis, slug, definition, this.cacheTtlSeconds)
    return definition
  }

  /**
   * Get a form definition from Redis; lazily re-fetch from the API if the TTL has expired.
   * @param {import('ioredis').Redis | import('ioredis').Cluster} redis
   * @param {string} slug
   * @param {(definition: import('@defra/forms-model').FormDefinition) => import('@defra/forms-model').FormDefinition} configureDefinition
   * @returns {Promise<import('@defra/forms-model').FormDefinition>}
   */
  async getFormDefinition(redis, slug, configureDefinition) {
    const cached = await getFormDef(redis, slug)
    return cached ?? (await this.fetchAndCacheDefinition(redis, slug, configureDefinition))
  }

  /**
   * Fetch all API-sourced forms on startup, validate, and populate Redis.
   * Shared redirect rules are merged into each definition before validation.
   * Throws on the first validation failure (same behaviour as YAML forms).
   *
   * @param {import('ioredis').Redis | import('ioredis').Cluster} redis
   * @param {string[]} slugs
   * @param {Record<string, unknown>} sharedRules
   * @param {(definition: import('@defra/forms-model').FormDefinition) => import('@defra/forms-model').FormDefinition} configureDefinition
   * @param {(form: {title: string}, definition: import('@defra/forms-model').FormDefinition) => void} validateWhitelist
   * @param {(form: {title: string}, definition: import('@defra/forms-model').FormDefinition) => void} validateRedirectRules
   * @param {(form: {title: string}, definition: import('@defra/forms-model').FormDefinition) => void} validateDetailsPage
   */
  async loadAll(
    redis,
    slugs,
    sharedRules,
    configureDefinition,
    validateWhitelist,
    validateRedirectRules,
    validateDetailsPage
  ) {
    for (const slug of slugs) {
      try {
        const [entry, rawDefinition] = await Promise.all([this.fetchFormMetadata(slug), this.fetchFormDefinition(slug)])

        // Merge shared redirect rules (same as YAML forms)
        if (rawDefinition.metadata) {
          const existingRules = /** @type {Record<string, unknown>} */ (rawDefinition.metadata.grantRedirectRules)
          rawDefinition.metadata.grantRedirectRules = { ...sharedRules, ...existingRules }
        }

        // Apply URL substitutions
        const definition = configureDefinition(rawDefinition)

        // Copy metadata from the definition into the cache entry
        entry.metadata = definition.metadata

        const form = { title: entry.title }
        validateWhitelist(form, definition)
        logger.info(`Whitelist configuration validated for API form: ${entry.title}`)

        validateRedirectRules(form, definition)
        logger.info(`Grant redirect rules validated for API form: ${entry.title}`)

        validateDetailsPage(form, definition)

        await Promise.all([
          setFormMeta(redis, slug, entry),
          setFormDef(redis, slug, definition, this.cacheTtlSeconds),
          setSlugReverse(redis, entry.id, slug)
        ])

        logger.info(`Loaded API form into Redis: ${slug}`)
      } catch (error) {
        logger.error(`Failed to load API form "${slug}" during startup: ${error.message}`)
        throw error
      }
    }
  }
}
