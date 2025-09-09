import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { metadata } from '../config.js'
import { FileFormService } from '@defra/forms-engine-plugin/file-form-service.js'
import path from 'node:path'
import fs from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'

// Simple in-memory cache of discovered forms metadata
let formsCache = []

export function getFormsCache() {
  return formsCache
}

export function configureFormDefinition(definition) {
  const logger = createLogger()
  const environment = config.get('cdpEnvironment')

  if (definition.pages) {
    definition.pages.forEach((page) => {
      const events = page.events
      if (events) {
        if (events.onLoad?.options.url && environment !== 'local') {
          events.onLoad.options.url = events.onLoad.options.url.replace('cdpEnvironment', environment)
        } else if (events.onLoad?.options.url && environment === 'local') {
          events.onLoad.options.url = 'http://localhost:3001/scoring/api/v1/adding-value/score?allowPartialScoring=true'
        } else {
          // If we have a URL but environment is neither 'local' nor a non-local environment,
          // we should log this unexpected case but not modify the URL
          logger.warn(`Unexpected environment value: ${environment}`)
        }
      }
    })
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
        title: form.title
      })
    )
  )

  return addedForms.size
}

function validateWhitelistVariableCompleteness(whitelistCrnEnvVar, whitelistSbiEnvVar, form, definition, logger) {
  if ((whitelistCrnEnvVar && !whitelistSbiEnvVar) || (!whitelistCrnEnvVar && whitelistSbiEnvVar)) {
    const missingVar = whitelistCrnEnvVar ? 'whitelistSbiEnvVar' : 'whitelistCrnEnvVar'
    const presentVar = whitelistCrnEnvVar ? 'whitelistCrnEnvVar' : 'whitelistSbiEnvVar'
    const error = `Incomplete whitelist configuration in form ${definition.name || form.title || 'unnamed'}: ${presentVar} is defined but ${missingVar} is missing. Both CRN and SBI whitelist variables must be configured together.`
    logger.error(error)
    throw new Error(error)
  }
}

function validateCrnEnvironmentVariable(whitelistCrnEnvVar, form, definition, logger) {
  if (whitelistCrnEnvVar && !process.env[whitelistCrnEnvVar]) {
    const error = `CRN whitelist environment variable ${whitelistCrnEnvVar} is defined in form ${definition.name || form.title || 'unnamed'} but not configured in environment`
    logger.error(error)
    throw new Error(error)
  }
}

function validateSbiEnvironmentVariable(whitelistSbiEnvVar, form, definition, logger) {
  if (whitelistSbiEnvVar && !process.env[whitelistSbiEnvVar]) {
    const error = `SBI whitelist environment variable ${whitelistSbiEnvVar} is defined in form ${definition.name || form.title || 'unnamed'} but not configured in environment`
    logger.error(error)
    throw new Error(error)
  }
}

export function validateWhitelistConfiguration(form, definition) {
  const logger = createLogger()

  if (definition.metadata) {
    const whitelistCrnEnvVar = definition.metadata.whitelistCrnEnvVar
    const whitelistSbiEnvVar = definition.metadata.whitelistSbiEnvVar

    validateWhitelistVariableCompleteness(whitelistCrnEnvVar, whitelistSbiEnvVar, form, definition, logger)
    validateCrnEnvironmentVariable(whitelistCrnEnvVar, form, definition, logger)
    validateSbiEnvironmentVariable(whitelistSbiEnvVar, form, definition, logger)
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
          title
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
  for (const form of forms) {
    try {
      const definition = loader.getFormDefinition(form.id)
      validateWhitelistConfiguration(form, definition)

      if (definition.metadata?.whitelistCrnEnvVar || definition.metadata?.whitelistSbiEnvVar) {
        logger.info(`Whitelist configuration validated for form: ${form.title}`)
      }
    } catch (error) {
      logger.error(`Whitelist validation failed during startup: ${error.message}`)
      throw error
    }
  }

  return loader.toFormsService()
}
