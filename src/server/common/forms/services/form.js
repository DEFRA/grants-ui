import { config } from '~/src/config/config.js'
import { log, LogCodes, logger } from '~/src/server/common/helpers/logging/log.js'
import { metadata } from '../config.js'
import { FileFormService } from '@defra/forms-engine-plugin/file-form-service.js'
import path from 'node:path'
import fs, { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { notFound } from '@hapi/boom'
import Joi from 'joi'
import agreements from '~/src/config/agreements.js'
import {
  getFormMeta,
  getFormsRedisClient,
  getSlugByFormId,
  setAllSlugs,
  setFormMeta,
  setSlugReverse
} from './forms-redis.js'
import { waitForRedisReady } from '~/src/server/common/helpers/redis-client.js'
import {
  currentRequest,
  getStateWithDefinition,
  resolveVersion
} from '~/src/server/common/helpers/state/state-with-definition-context.js'
import { validateDetailsPageConfig } from '~/src/server/common/services/details-page/validate-details-page-config.js'

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

class GrantsFormLoader extends FileFormService {
  /**
   * @param {string} id
   * @returns {FormDefinition}
   */
  getFormDefinition(id) {
    const definition = super.getFormDefinition(id)

    hoistPageConfig(definition)
    return configureFormDefinition(definition)
  }
}

/**
 * @param {GrantsFormLoader} loader
 * @param {YamlForm[]} forms
 * @returns {Promise<number>}
 */
export async function addAllForms(loader, forms) {
  const addedForms = new Set()

  const uniqueForms = forms.filter((form) => {
    const key = `${form.id}-${form.slug}`
    if (addedForms.has(key)) {
      logger.warn(`Skipping duplicate form: ${form.slug} with id ${form.id}`)
      return false
    }
    addedForms.add(key)
    return true
  })

  await Promise.all(
    uniqueForms.map((form) =>
      loader.addForm(
        form.path,
        /** @type {FormMetadata} */ ({
          ...metadata,
          id: form.id,
          slug: form.slug,
          title: form.title,
          metadata: form.metadata
        })
      )
    )
  )

  return addedForms.size
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function exactlyOneDefined(a, b) {
  return Boolean(a) !== Boolean(b) // XOR
}

/**
 * @param {string | undefined} whitelistCrnEnvVar
 * @param {string | undefined} whitelistSbiEnvVar
 * @param {FormSummary} form
 * @param {FormDefinition} definition
 * @returns {void}
 */
export function validateWhitelistVariableCompleteness(whitelistCrnEnvVar, whitelistSbiEnvVar, form, definition) {
  if (!exactlyOneDefined(whitelistCrnEnvVar, whitelistSbiEnvVar)) {
    return
  }

  const formName = definition.name || form.title || 'unnamed'
  const missingVar = whitelistCrnEnvVar ? 'whitelistSbiEnvVar' : 'whitelistCrnEnvVar'
  const presentVar = whitelistCrnEnvVar ? 'whitelistCrnEnvVar' : 'whitelistSbiEnvVar'

  log(LogCodes.SYSTEM.WHITELIST_CONFIG_INCOMPLETE, { formName, missingVar, presentVar })

  throw new Error(
    `Incomplete whitelist configuration in form ${formName}: ${presentVar} is defined but ${missingVar} is missing. Both CRN and SBI whitelist variables must be configured together.`
  )
}

/**
 * @param {string | undefined} whitelistCrnEnvVar
 * @param {FormSummary} form
 * @param {FormDefinition} definition
 * @returns {void}
 */
function validateCrnEnvironmentVariable(whitelistCrnEnvVar, form, definition) {
  if (whitelistCrnEnvVar && !process.env[whitelistCrnEnvVar]) {
    const formName = definition.name || form.title || 'unnamed'
    log(LogCodes.SYSTEM.CRN_ENV_VAR_MISSING, {
      envVar: whitelistCrnEnvVar,
      formName
    })
    const error = `CRN whitelist environment variable ${whitelistCrnEnvVar} is defined in form ${definition.name || form.title || 'unnamed'} but not configured in environment`
    throw new Error(error)
  }
}

/**
 * @param {string | undefined} whitelistSbiEnvVar
 * @param {FormSummary} form
 * @param {FormDefinition} definition
 * @returns {void}
 */
function validateSbiEnvironmentVariable(whitelistSbiEnvVar, form, definition) {
  if (whitelistSbiEnvVar && !process.env[whitelistSbiEnvVar]) {
    const formName = definition.name || form.title || 'unnamed'

    log(LogCodes.SYSTEM.SBI_ENV_VAR_MISSING, {
      envVar: whitelistSbiEnvVar,
      formName
    })
    const error = `SBI whitelist environment variable ${whitelistSbiEnvVar} is defined in form ${definition.name || form.title || 'unnamed'} but not configured in environment`
    throw new Error(error)
  }
}

/**
 * @param {FormSummary} form
 * @param {FormDefinition} definition
 * @returns {void}
 */
export function validateDetailsPageConfiguration(form, definition) {
  if (!definition.metadata?.detailsPage) {
    return
  }
  const formName = definition.name || form.title || 'unnamed'
  validateDetailsPageConfig(
    /** @type {Parameters<typeof validateDetailsPageConfig>[0]} */ (definition.metadata.detailsPage),
    formName
  )
}

/**
 * @param {FormSummary} form
 * @param {FormDefinition} definition
 * @returns {void}
 */
export function validateWhitelistConfiguration(form, definition) {
  const enabledCodes = config
    .get('enableAllowlistGrantCodes')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const grantCode =
    /** @type {{ submission?: { grantCode?: string } } | undefined} */ (definition.metadata)?.submission?.grantCode ??
    form.slug

  if (enabledCodes.includes(grantCode)) {
    return
  }

  if (definition.metadata) {
    const whitelistCrnEnvVar = /** @type {string | undefined} */ (definition.metadata.whitelistCrnEnvVar)
    const whitelistSbiEnvVar = /** @type {string | undefined} */ (definition.metadata.whitelistSbiEnvVar)

    validateWhitelistVariableCompleteness(whitelistCrnEnvVar, whitelistSbiEnvVar, form, definition)
    validateCrnEnvironmentVariable(whitelistCrnEnvVar, form, definition)
    validateSbiEnvironmentVariable(whitelistSbiEnvVar, form, definition)
  }
}

/**
 * @param {string} baseDir
 * @returns {Promise<string[]>}
 */
async function listYamlFilesRecursively(baseDir) {
  /** @type {string[]} */
  const out = []
  const entries = await fs.readdir(baseDir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(baseDir, e.name)
    if (e.isDirectory()) {
      out.push(...(await listYamlFilesRecursively(full)))
    } else if (e.isFile() && /\.(ya?ml)$/i.test(e.name)) {
      out.push(full)
    } else {
      // Ignore other files
    }
  }
  return out
}

const preSubmissionRuleSchema = Joi.object({
  toPath: Joi.string().pattern(/^\/.*/).required()
})

const postSubmissionRuleSchema = Joi.object({
  fromGrantsStatus: Joi.string().required(),
  gasStatus: Joi.string().required(),
  toGrantsStatus: Joi.string().required(),
  toPath: Joi.string().pattern(/^\/.*/).required()
})

/**
 * @param {FormSummary} form
 * @param {FormDefinition} definition
 * @returns {void}
 */
export function validateGrantRedirectRules(form, definition) {
  const formName = definition.name || form.title || 'unnamed'

  const redirectRules = /** @type {SharedRedirectRules} */ (definition.metadata?.grantRedirectRules ?? {})
  const preSubmission = redirectRules.preSubmission ?? []
  const postSubmission = redirectRules.postSubmission ?? []

  //
  // Validate preSubmission
  //
  const { error: preError } = Joi.array().items(preSubmissionRuleSchema).length(1).validate(preSubmission)
  if (preError) {
    log(LogCodes.SYSTEM.INVALID_REDIRECT_RULES, {
      formName,
      reason: `preSubmission: ${preError.message}`
    })
    throw new Error(
      `Invalid redirect rules in form ${formName}: ${preError.message}. Expected one rule with toPath property.`
    )
  }

  //
  // Validate postSubmission
  //
  const { error: postError } = Joi.array().items(postSubmissionRuleSchema).validate(postSubmission)
  if (postError) {
    log(LogCodes.SYSTEM.INVALID_REDIRECT_RULES, {
      formName,
      reason: `postSubmission schema: ${postError.message}`
    })
    throw new Error(`Invalid redirect rules in form ${formName}: ${postError.message}`)
  }

  if (postSubmission.length === 0) {
    log(LogCodes.SYSTEM.INVALID_REDIRECT_RULES, {
      formName,
      reason: 'postSubmission missing completely'
    })
    throw new Error(`Invalid redirect configuration in form ${formName}: no postSubmission redirect rules defined`)
  }

  const hasFallbackRule = postSubmission.some(
    (rule) => rule.fromGrantsStatus === 'default' && rule.gasStatus === 'default'
  )
  if (!hasFallbackRule) {
    log(LogCodes.SYSTEM.INVALID_REDIRECT_RULES, {
      formName,
      reason: 'missing default/default fallback rule'
    })
    throw new Error(
      `Invalid redirect configuration in form ${formName}: missing default/default fallback rule in postSubmission`
    )
  }
}

/**
 * @param {string[]} backendSlugs
 * @param {string} [baseDir]
 * @returns {Promise<YamlForm[]>}
 */
async function discoverFormsFromYaml(
  backendSlugs,
  baseDir = path.resolve(process.cwd(), 'src/server/common/forms/definitions')
) {
  const isProduction = config.get('cdpEnvironment')?.toLowerCase() === 'prod'
  const backendSlugSet = new Set(backendSlugs)
  /** @type {string[]} */
  let files = []
  try {
    files = await listYamlFilesRecursively(baseDir)
  } catch (err) {
    logger.error(`Failed to read forms directory "${baseDir}": ${/** @type {Error} */ (err)?.message}`)
    return []
  }

  /** @type {YamlForm[]} */
  const forms = []
  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const { name: title, metadata: formMetadata } = parseYaml(raw)

      // Use file name as slug
      const fileName = path.basename(filePath, path.extname(filePath))

      // Skip forms whose definition is served from grants-ui-backend
      if (backendSlugSet.has(fileName)) {
        logger.info(`Skipping YAML file for "${fileName}" — will be loaded from grants-ui-backend`)
        continue
      }

      const { id, enabledInProd } = formMetadata

      // Only include forms in production if they have enabledInProd set to true
      if (!isProduction || enabledInProd === true) {
        forms.push({
          path: filePath,
          id,
          slug: fileName,
          title,
          metadata: formMetadata
        })
      }
    } catch (err) {
      logger.error(`Failed to parse YAML form "${filePath}": ${/** @type {Error} */ (err)?.message}`)
    }
  }

  return forms
}

/**
 * @param {string[]} backendSlugs
 * @returns {Promise<{ loader: GrantsFormLoader, yamlForms: YamlForm[] }>}
 */
async function initialiseLoader(backendSlugs) {
  const loader = new GrantsFormLoader()
  const yamlForms = await discoverFormsFromYaml(backendSlugs)
  await addAllForms(loader, yamlForms)
  return { loader, yamlForms }
}

/**
 * @param {GrantsFormLoader} loader
 * @param {FormsRedisClient} redis
 * @param {YamlForm[]} yamlForms
 * @param {SharedRedirectRules} sharedRules
 * @returns {Promise<void>}
 */
async function registerYamlForms(loader, redis, yamlForms, sharedRules) {
  for (const form of yamlForms) {
    try {
      const definition = loader.getFormDefinition(form.id)
      const meta = /** @type {Record<string, unknown>} */ (definition.metadata ??= {})
      meta.grantRedirectRules = {
        ...sharedRules,
        .../** @type {Record<string, unknown> | undefined} */ (meta.grantRedirectRules)
      }

      validateWhitelistConfiguration(form, definition)
      logger.info(`Whitelist configuration validated for form: ${form.title}`)

      validateGrantRedirectRules(form, definition)
      logger.info(`Grant redirect rules validated for form: ${form.title}`)

      validateDetailsPageConfiguration(form, definition)

      await Promise.all([
        setFormMeta(redis, form.slug, {
          id: form.id,
          slug: form.slug,
          title: form.title,
          metadata: form.metadata,
          source: 'yaml',
          path: form.path
        }),
        setSlugReverse(redis, form.id, form.slug)
      ])
    } catch (error) {
      logger.error(`Form validation failed during startup for ${form.title}: ${/** @type {Error} */ (error).message}`)
      throw error
    }
  }
}

/**
 * Registers backend-sourced forms in Redis. Their definitions are resolved per
 * request from the combined `POST /state/with-definition` endpoint, so only a
 * lightweight slug/meta registration is needed at startup (no definition fetch).
 *
 * @param {FormsRedisClient} redis
 * @param {string[]} backendSlugs
 * @returns {Promise<void>}
 */
async function registerBackendForms(redis, backendSlugs) {
  for (const slug of backendSlugs) {
    await Promise.all([
      setFormMeta(redis, slug, {
        id: slug,
        slug,
        title: slug,
        source: 'backend'
      }),
      setSlugReverse(redis, slug, slug)
    ])
  }
}

/**
 * Resolves a backend-sourced form definition from the per-request combined
 * response (stashed on `request.app` and recovered here via AsyncLocalStorage).
 * Throws clearly if there is no active request context, so a background or
 * unscoped call fails fast rather than fetching without a user.
 *
 * @param {string} slug
 * @returns {Promise<FormDefinition>}
 */
async function resolveBackendDefinition(slug) {
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
  return configureFormDefinition(definition)
}

/**
 * @param {BaseFormsService} baseService
 * @param {FormsRedisClient} redis
 */
function buildServiceInterface(baseService, redis) {
  return {
    /**
     * @param {string} slug
     */
    getFormMetadata: async (slug) => {
      const entry = await getFormMeta(redis, slug)
      if (!entry) {
        throw notFound(`Form '${slug}' not found`)
      }
      // ── backend source (default going forward) ──
      if (entry.source === 'backend') {
        const definition = await resolveBackendDefinition(slug)

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
          id: entry.id,
          slug: entry.slug,
          title: definition.name ?? entry.title,
          metadata: { ...definition.metadata, version },
          updatedAt,
          live: isActive ? stamped : undefined,
          draft: isActive ? undefined : stamped
        }
      }
      // ── legacy YAML branch (removal-ready) ──
      try {
        return await baseService.getFormMetadata(slug)
      } catch (error) {
        throw notFound(`Form '${slug}' not found`, error)
      }
    },

    /**
     * @param {string} id
     * @param {import('@defra/forms-engine-plugin/types').FormStatus} state
     */
    getFormDefinition: async (id, state) => {
      const slug = await getSlugByFormId(redis, id)
      if (!slug) {
        throw notFound(`Form definition '${id}' not found`)
      }
      const entry = await getFormMeta(redis, slug)
      // ── backend source (default going forward) ──
      if (entry?.source === 'backend') {
        return resolveBackendDefinition(slug)
      }
      // ── legacy YAML branch (removal-ready) ──
      try {
        return await baseService.getFormDefinition(id, state)
      } catch (error) {
        throw notFound(`Form definition '${id}' not found`, error)
      }
    },

    /**
     * Used by the slug-lookup helpers (`find-form-by-slug.js`) for forms that are
     * not YAML-sourced, i.e. backend-sourced forms only.
     * @param {string} slug
     */
    getFormDefinitionBySlug: async (slug) => {
      return resolveBackendDefinition(slug)
    }
  }
}

export const formsService = async () => {
  const redis = getFormsRedisClient()
  await waitForRedisReady(redis)

  const backendSlugs = /** @type {string[]} */ (config.get('forms.backendFormDefEnabledSlugs')).filter(Boolean)

  const { loader, yamlForms } = await initialiseLoader(backendSlugs)
  const sharedRules = await loadSharedRedirectRules()

  await registerYamlForms(loader, redis, yamlForms, sharedRules)

  // ── Backend-sourced forms ───────────────────────────────────────────────────
  // Definitions are resolved per request from the combined backend endpoint.
  await registerBackendForms(redis, backendSlugs)

  // ── Slug index ────────────────────────────────────────────────────────────
  await setAllSlugs(redis, [...yamlForms.map((f) => f.slug), ...backendSlugs])

  return buildServiceInterface(loader.toFormsService(), redis)
}

/**
 * @import { FormDefinition, FormMetadata, FormMetadataInput } from '@defra/forms-model'
 * @import { Redis, Cluster } from 'ioredis'
 */

/**
 * @typedef {FormDefinition & { metadata: NonNullable<FormDefinition['metadata']> }} FormDefinitionWithMetadata
 */

/**
 * @typedef {FormMetadataInput & { slug: string }} FormMetadataInputWithSlug
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

/**
 * @typedef {object} YamlFormMetadata
 * @property {string} id
 * @property {boolean} [enabledInProd]
 */

/**
 * @typedef {object} YamlForm
 * @property {string} path
 * @property {string} id
 * @property {string} slug
 * @property {string} title
 * @property {YamlFormMetadata & Record<string, unknown>} metadata
 */

/**
 * @typedef {{ title?: string, slug?: string }} FormSummary
 */

/**
 * @typedef {object} BaseFormsService
 * @property {(slug: string) => Promise<unknown>} getFormMetadata
 * @property {(id: string, state: import('@defra/forms-engine-plugin/types').FormStatus) => Promise<unknown>} getFormDefinition
 */
