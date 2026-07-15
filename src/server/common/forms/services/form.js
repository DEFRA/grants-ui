import { config } from '~/src/config/config.js'
import { logger } from '~/src/server/common/helpers/logging/log.js'
import { metadata } from '../config.js'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { notFound } from '@hapi/boom'
import agreements from '~/src/config/agreements.js'
import { getFormsRedisClient, registerSlug, setFormMeta } from './forms-redis.js'
import { waitForRedisReady } from '~/src/server/common/helpers/redis-client.js'
import {
  currentRequest,
  getStateWithDefinition,
  resolveVersion
} from '~/src/server/common/helpers/state/state-with-definition-context.js'

/**
 * @returns {Promise<SharedRedirectRules>}
 */
async function loadSharedRedirectRules() {
  const filePath = path.resolve(process.cwd(), 'src/server/common/forms/shared-redirect-rules.yaml')
  const raw = await readFile(filePath, 'utf8')
  const parsed = parseYaml(raw)
  const rules = parsed.sharedRedirectRules ?? {}

  if (rules.postSubmission) {
    rules.postSubmission = rules.postSubmission.map((/** @type {PostSubmissionRule} */ rule) => ({
      ...rule,
      toPath: rule.toPath === '__AGREEMENTS_BASE_URL__' ? agreements.get('baseUrl') : rule.toPath
    }))
  }

  return rules
}

/**
 * @param {FormDefinition} definition
 * @returns {FormDefinition}
 */
export function configureFormDefinition(definition) {
  const environment = config.get('cdpEnvironment')

  for (const page of definition.pages ?? []) {
    const url = page.events?.onLoad?.options?.url
    if (url) {
      if (environment !== 'local') {
        const opts = /** @type {{ url: string }} */ (page.events?.onLoad?.options)
        opts.url = url.replace('cdpEnvironment', environment)
      } else {
        logger.warn(`Unexpected environment value: ${environment}`)
      }
    }
  }

  return definition
}

/**
 * Hoists the `config` key from each page into `definition.metadata.pageConfig[path]`
 * so it is accessible in controllers via `model.def.metadata.pageConfig[pageDef.path]`
 * without triggering DXT Joi schema validation errors (which don't allow unknown page keys).
 *
 * YAML usage:
 *   - path: /my-page
 *     controller: MyController
 *     config:
 *       myCustomParam: true
 */
/**
 * @param {FormDefinition} definition
 * @returns {FormDefinition}
 */
export function hoistPageConfig(definition) {
  if (!definition.pages?.length) {
    return definition
  }

  definition.metadata ??= {}
  definition.metadata.pageConfig ??= {}
  const pageConfig = /** @type {Record<string, unknown>} */ (definition.metadata.pageConfig)

  for (const page of definition.pages) {
    const p = /** @type {typeof page & { config?: Record<string, unknown> }} */ (page)
    if (p.config) {
      pageConfig[p.path] = p.config
      delete p.config
    }
  }

  return definition
}

/**
 * Records a successfully resolved form in Redis: adds the slug to the
 * known-slug set and refreshes the meta entry (title + definition metadata)
 * that `findFormBySlug` and the dev-tools listings read.
 *
 * Runs only *after* the backend has returned a definition, so unknown or
 * mistyped slugs never pollute the registry, and runs on every resolution so
 * the entry tracks the latest published definition instead of going stale.
 *
 * @param {FormsRedisClient} redis
 * @param {string} slug
 * @param {FormDefinition} definition
 * @returns {Promise<void>}
 */
async function registerResolvedForm(redis, slug, definition) {
  await Promise.all([
    setFormMeta(redis, slug, {
      id: slug,
      slug,
      title: definition.name ?? slug,
      source: 'backend',
      metadata: /** @type {Record<string, unknown>} */ (definition.metadata)
    }),
    registerSlug(redis, slug)
  ])
}

/**
 * Resolves a backend-sourced form definition from the per-request combined
 * response (stashed on `request.app` and recovered here via AsyncLocalStorage).
 * Throws clearly if there is no active request context, so a background or
 * unscoped call fails fast rather than fetching without a user.
 *
 * A form's own `grantRedirectRules` (e.g. `null`, or a partial override) is
 * layered over `sharedRules` so backend-sourced forms inherit the same
 * defaults instead of being served whatever the backend stored verbatim.
 *
 * @param {string} slug
 * @param {SharedRedirectRules} sharedRules
 * @returns {Promise<FormDefinition>}
 */
async function resolveBackendDefinition(slug, sharedRules) {
  const request = currentRequest()
  if (!request) {
    throw new Error(`No request context available to resolve backend form definition for '${slug}'`)
  }

  const body = await getStateWithDefinition(request)
  // `body.definition` is the full definition document; the DXT form definition
  // is the nested `definition.definition`.
  const definition = body?.definition?.definition
  if (!definition) {
    throw notFound(`Form definition for '${slug}' not found`)
  }

  hoistPageConfig(definition)
  configureFormDefinition(definition)

  const meta = /** @type {Record<string, unknown>} */ (definition.metadata ??= {})
  meta.grantRedirectRules = {
    ...sharedRules,
    .../** @type {Record<string, unknown> | undefined} */ (meta.grantRedirectRules)
  }

  return definition
}

/**
 * @param {FormsRedisClient} redis
 * @param {SharedRedirectRules} sharedRules
 */
function buildServiceInterface(redis, sharedRules) {
  return {
    /**
     * @param {string} slug
     */
    getFormMetadata: async (slug) => {
      const definition = await resolveBackendDefinition(slug, sharedRules)
      await registerResolvedForm(redis, slug, definition)

      // The backend definition document carries its own `updatedAt` (which
      // changes when a new version is published) and a `status`
      // (`active`/`draft`). Stamp the real `updatedAt` onto the metadata so
      // the forms-engine model cache (keyed by `id + state + isPreview`, and
      // invalidated only when `metadata[state].updatedAt` changes) rebuilds
      // the model whenever the version changes. Map `status` to the form
      // state the engine resolves (`active` → live, `draft` → draft) so
      // applicants are never served a draft on the live route, and clear the
      // unused slot.
      const request = currentRequest()
      const body = request ? await getStateWithDefinition(request) : null
      const version = resolveVersion(body)
      const definitionDoc = body?.definition
      const updatedAt = new Date(/** @type {string} */ (definitionDoc?.updatedAt))
      const isActive = definitionDoc?.status !== 'draft'
      const stamped = { ...(metadata.live ?? {}), updatedAt }

      return {
        ...metadata,
        id: slug,
        slug,
        title: definition.name ?? slug,
        metadata: { ...definition.metadata, version },
        updatedAt,
        live: isActive ? stamped : undefined,
        draft: isActive ? undefined : stamped
      }
    },

    /**
     * The engine calls this with the `id` it got from `getFormMetadata`, which
     * is always the slug for backend-sourced forms — so the id is resolved
     * directly, with no reverse lookup.
     * @param {string} id
     * @param {import('@defra/forms-engine-plugin/types').FormStatus} _state
     */
    getFormDefinition: async (id, _state) => {
      return resolveBackendDefinition(id, sharedRules)
    },

    /**
     * Used by the slug-lookup helpers (`find-form-by-slug.js`).
     * @param {string} slug
     */
    getFormDefinitionBySlug: async (slug) => {
      return resolveBackendDefinition(slug, sharedRules)
    }
  }
}

export const formsService = async () => {
  const redis = getFormsRedisClient()
  await waitForRedisReady(redis)

  const sharedRules = await loadSharedRedirectRules()

  return buildServiceInterface(redis, sharedRules)
}

/**
 * @import { FormDefinition } from '@defra/forms-model'
 * @import { Redis, Cluster } from 'ioredis'
 */

/**
 * @typedef {Redis | Cluster} FormsRedisClient
 */

/**
 * @typedef {object} PostSubmissionRule
 * @property {string} fromGrantsStatus
 * @property {string} gasStatus
 * @property {string} toGrantsStatus
 * @property {string} toPath
 */

/**
 * @typedef {object} PreSubmissionRule
 * @property {string} toPath
 */

/**
 * @typedef {object} SharedRedirectRules
 * @property {PreSubmissionRule[]} [preSubmission]
 * @property {PostSubmissionRule[]} [postSubmission]
 */
