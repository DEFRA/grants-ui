import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { metadata } from '../config.js'
import { FileFormService } from '@defra/forms-engine-plugin/file-form-service.js'
import path from 'node:path'
import fs, { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import { notFound } from '@hapi/boom'
import Joi from 'joi'
import agreements from '~/src/config/agreements.js'

// Simple in-memory cache of discovered forms metadata
let formsCache = []

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

export function getFormsCache() {
  return formsCache
}

export function configureFormDefinition(definition) {
  const logger = createLogger()
  const environment = config.get('cdpEnvironment')

  for (const page of definition.pages ?? []) {
    const events = page.events
    if (events) {
      if (events.onLoad?.options.url && environment !== 'local') {
        events.onLoad.options.url = events.onLoad.options.url.replace('cdpEnvironment', environment)
      } else if (events.onLoad?.options.url && environment === 'local') {
        events.onLoad.options.url =
          'http://ffc-grants-scoring:3002/scoring/api/v1/adding-value/score?allowPartialScoring=true' // NOSONAR - used in local testing and CI
      } else {
        // If we have a URL but environment is neither 'local' nor a non-local environment,
        // we should log this unexpected case but not modify the URL
        logger.warn(`Unexpected environment value: ${environment}`)
      }
    }
  }

  return definition
}

class GrantsFormLoader extends FileFormService {
  getFormDefinition(id) {
    const definition = super.getFormDefinition(id)

    return configureFormDefinition(definition)
  }
}

export async function addAllForms(loader, forms) {
  const addedForms = new Set()
  const logger = createLogger()

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

function validateWhitelistVariableCompleteness(whitelistCrnEnvVar, whitelistSbiEnvVar, form, definition) {
  if ((whitelistCrnEnvVar && !whitelistSbiEnvVar) || (!whitelistCrnEnvVar && whitelistSbiEnvVar)) {
    const missingVar = whitelistCrnEnvVar ? 'whitelistSbiEnvVar' : 'whitelistCrnEnvVar'
    const presentVar = whitelistCrnEnvVar ? 'whitelistCrnEnvVar' : 'whitelistSbiEnvVar'
    const error = `Incomplete whitelist configuration in form ${definition.name || form.title || 'unnamed'}: ${presentVar} is defined but ${missingVar} is missing. Both CRN and SBI whitelist variables must be configured together.`
    throw new Error(error)
  }
}

function validateCrnEnvironmentVariable(whitelistCrnEnvVar, form, definition) {
  if (whitelistCrnEnvVar && !process.env[whitelistCrnEnvVar]) {
    const error = `CRN whitelist environment variable ${whitelistCrnEnvVar} is defined in form ${definition.name || form.title || 'unnamed'} but not configured in environment`
    throw new Error(error)
  }
}

function validateSbiEnvironmentVariable(whitelistSbiEnvVar, form, definition) {
  if (whitelistSbiEnvVar && !process.env[whitelistSbiEnvVar]) {
    const error = `SBI whitelist environment variable ${whitelistSbiEnvVar} is defined in form ${definition.name || form.title || 'unnamed'} but not configured in environment`
    throw new Error(error)
  }
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
    throw new Error(
      `Invalid redirect rules in form ${formName}: ${preError.message}. Expected one rule with toPath property.`
    )
  }

  //
  // Validate postSubmission
  //
  const { error: postError } = Joi.array().items(postSubmissionRuleSchema).validate(postSubmission)
  if (postError) {
    throw new Error(`Invalid redirect rules in form ${formName}: ${postError.message}`)
  }

  if (postSubmission.length === 0) {
    throw new Error(`Invalid redirect configuration in form ${formName}: no postSubmission redirect rules defined`)
  }

  const hasFallbackRule = postSubmission.some(
    (rule) => rule.fromGrantsStatus === 'default' && rule.gasStatus === 'default'
  )
  if (!hasFallbackRule) {
    throw new Error(
      `Invalid redirect configuration in form ${formName}: missing default/default fallback rule in postSubmission`
    )
  }
}

async function discoverFormsFromYaml(baseDir = path.resolve(process.cwd(), 'src/server/common/forms/definitions')) {
  const isProduction = config.get('cdpEnvironment')?.toLowerCase() === 'prod'
  const logger = createLogger()
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
      const { name: title, metadata: formMetadata, tasklist } = parseYaml(raw)

      // Skip parsing if tasklist
      if (tasklist) {
        continue
      }

      // Use file name as slug
      const fileName = path.basename(filePath, path.extname(filePath))

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

export const formsService = async () => {
  const loader = new GrantsFormLoader()

  const forms = await discoverFormsFromYaml()
  // Cache the discovered forms for reuse in tasklists
  formsCache = forms
  await addAllForms(loader, forms)

  const logger = createLogger()

  const sharedRules = await loadSharedRedirectRules()

  for (const form of forms) {
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
    } catch (error) {
      logger.error(`Form validation failed during startup for ${form.title}: ${error.message}`)
      throw error
    }
  }

  const baseService = loader.toFormsService()

  return {
    getFormMetadata: async (slug) => {
      try {
        return await baseService.getFormMetadata(slug)
      } catch (error) {
        throw notFound(`Form '${slug}' not found`, error)
      }
    },
    getFormDefinition: async (id, state) => {
      try {
        return await baseService.getFormDefinition(id, state)
      } catch (error) {
        throw notFound(`Form definition '${id}' not found`, error)
      }
    }
  }
}
