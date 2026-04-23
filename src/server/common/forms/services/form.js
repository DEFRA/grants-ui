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
import { ApiFormService } from './api-form-service.js'
import { validateDetailsPageConfig } from '~/src/server/common/services/details-page/validate-details-page-config.js'

async function loadSharedRedirectRules() {
  const filePath = path.resolve(process.cwd(), 'src/server/common/forms/shared-redirect-rules.yaml')
  const raw = await readFile(filePath, 'utf8')
  const parsed = parseYaml(raw)
  const rules = parsed.sharedRedirectRules ?? {}

  if (rules.postSubmission) {
    rules.postSubmission = rules.postSubmission.map((rule) => ({
      ...rule,
      toPath: rule.toPath === '__AGREEMENTS_BASE_URL__' ? agreements.get('baseUrl') : rule.toPath
    }))
  }

  return rules
}

export function configureFormDefinition(definition) {
  const environment = config.get('cdpEnvironment')

  for (const page of definition.pages ?? []) {
    const url = page.events?.onLoad?.options?.url
    if (url) {
      if (environment !== 'local') {
        page.events.onLoad.options.url = url.replace('cdpEnvironment', environment)
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
export function hoistPageConfig(definition) {
  if (!definition.pages?.length) {
    return definition
  }

  definition.metadata ??= {}
  definition.metadata.pageConfig ??= {}

  for (const page of definition.pages) {
    if (page.config) {
      definition.metadata.pageConfig[page.path] = page.config
      delete page.config
    }
  }

  return definition
}

class GrantsFormLoader extends FileFormService {
  getFormDefinition(id) {
    const definition = super.getFormDefinition(id)

    hoistPageConfig(definition)
    return configureFormDefinition(definition)
  }
}

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
      loader.addForm(form.path, {
        ...metadata,
        id: form.id,
        slug: form.slug,
        title: form.title,
        metadata: form.metadata
      })
    )
  )

  return addedForms.size
}

function exactlyOneDefined(a, b) {
  return Boolean(a) !== Boolean(b) // XOR
}

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

export function validateDetailsPageConfiguration(form, definition) {
  if (!definition.metadata?.detailsPage) {
    return
  }
  const formName = definition.name || form.title || 'unnamed'
  validateDetailsPageConfig(definition.metadata.detailsPage, formName)
}

export function validateWhitelistConfiguration(form, definition) {
  if (definition.metadata) {
    const whitelistCrnEnvVar = definition.metadata.whitelistCrnEnvVar
    const whitelistSbiEnvVar = definition.metadata.whitelistSbiEnvVar

    validateWhitelistVariableCompleteness(whitelistCrnEnvVar, whitelistSbiEnvVar, form, definition)
    validateCrnEnvironmentVariable(whitelistCrnEnvVar, form, definition)
    validateSbiEnvironmentVariable(whitelistSbiEnvVar, form, definition)
  }
}

async function listYamlFilesRecursively(baseDir) {
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

export function validateGrantRedirectRules(form, definition) {
  const formName = definition.name || form.title || 'unnamed'

  const redirectRules = definition.metadata?.grantRedirectRules ?? {}
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

async function discoverFormsFromYaml(
  apiSlugs,
  baseDir = path.resolve(process.cwd(), 'src/server/common/forms/definitions')
) {
  const isProduction = config.get('cdpEnvironment')?.toLowerCase() === 'prod'
  const apiSlugSet = new Set(apiSlugs)
  let files = []
  try {
    files = await listYamlFilesRecursively(baseDir)
  } catch (err) {
    logger.error(`Failed to read forms directory "${baseDir}": ${err?.message}`)
    return []
  }

  const forms = []
  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      const { name: title, metadata: formMetadata } = parseYaml(raw)

      // Use file name as slug
      const fileName = path.basename(filePath, path.extname(filePath))

      // Skip forms that are provided by the Config API
      if (apiSlugSet.has(fileName)) {
        logger.info(`Skipping YAML file for "${fileName}" — will be loaded from Config API`)
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
      logger.error(`Failed to parse YAML form "${filePath}": ${err?.message}`)
    }
  }

  return forms
}

async function initialiseLoader(apiSlugs) {
  const loader = new GrantsFormLoader()
  const yamlForms = await discoverFormsFromYaml(apiSlugs)
  await addAllForms(loader, yamlForms)
  return { loader, yamlForms }
}

async function registerYamlForms(loader, redis, yamlForms, sharedRules) {
  for (const form of yamlForms) {
    try {
      const definition = loader.getFormDefinition(form.id)
      definition.metadata.grantRedirectRules = {
        ...sharedRules,
        ...definition.metadata.grantRedirectRules
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
      logger.error(`Form validation failed during startup for ${form.title}: ${error.message}`)
      throw error
    }
  }
}

function buildServiceInterface(baseService, apiFormService, redis) {
  return {
    /**
     * @param {string} slug
     */
    getFormMetadata: async (slug) => {
      const entry = await getFormMeta(redis, slug)
      if (!entry) {
        throw notFound(`Form '${slug}' not found`)
      }
      if (entry.source === 'api') {
        // Return metadata in the shape the forms-engine-plugin expects
        return {
          ...metadata,
          id: entry.id,
          slug: entry.slug,
          title: entry.title,
          metadata: entry.metadata
        }
      }
      try {
        return await baseService.getFormMetadata(slug)
      } catch (error) {
        throw notFound(`Form '${slug}' not found`, error)
      }
    },

    /**
     * @param {string} id
     * @param {unknown} state
     */
    getFormDefinition: async (id, state) => {
      const slug = await getSlugByFormId(redis, id)
      if (!slug) {
        throw notFound(`Form definition '${id}' not found`)
      }
      const entry = await getFormMeta(redis, slug)
      if (entry?.source === 'api') {
        return apiFormService.getFormDefinition(redis, slug, configureFormDefinition)
      }
      try {
        return await baseService.getFormDefinition(id, state)
      } catch (error) {
        throw notFound(`Form definition '${id}' not found`, error)
      }
    },

    getFormDefinitionBySlug: async (slug) => {
      return await apiFormService.getFormDefinition(redis, slug, configureFormDefinition)
    }
  }
}

export const formsService = async () => {
  const redis = getFormsRedisClient()
  await waitForRedisReady(redis)

  const apiSlugs = /** @type {string[]} */ (config.get('configApi.formSlugs')).filter(Boolean)
  const apiUrl = config.get('configApi.url')
  const jwtSecret = config.get('configApi.jwtSecret')
  const jwtExpiry = config.get('configApi.jwtExpiry')
  const cacheTtlSeconds = config.get('configApi.cacheTtlSeconds')

  const { loader, yamlForms } = await initialiseLoader(apiSlugs)
  const sharedRules = await loadSharedRedirectRules()

  await registerYamlForms(loader, redis, yamlForms, sharedRules)

  // ── API forms ─────────────────────────────────────────────────────────────
  const apiFormService = new ApiFormService(apiUrl, jwtSecret, jwtExpiry, cacheTtlSeconds)

  if (apiSlugs.length > 0) {
    await apiFormService.loadAll(
      redis,
      apiSlugs,
      sharedRules,
      configureFormDefinition,
      validateWhitelistConfiguration,
      validateGrantRedirectRules,
      validateDetailsPageConfiguration
    )
  }

  // ── Slug index ────────────────────────────────────────────────────────────
  await setAllSlugs(redis, [...yamlForms.map((f) => f.slug), ...apiSlugs])

  return buildServiceInterface(loader.toFormsService(), apiFormService, redis)
}

/**
 * @typedef {import('@defra/forms-model').FormDefinition & { metadata: NonNullable<import('@defra/forms-model').FormDefinition['metadata']> }} FormDefinitionWithMetadata
 */

/**
 * @typedef {import('@defra/forms-model').FormMetadataInput & { slug: string }} FormMetadataInputWithSlug
 */
