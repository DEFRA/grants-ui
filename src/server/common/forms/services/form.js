import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { metadata } from '../config.js'
import { FileFormService } from '@defra/forms-engine-plugin/file-form-service.js'
import { allForms } from './forms-config.js'

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

export const formsService = async () => {
  const loader = new GrantsFormLoader()

  await addAllForms(loader, allForms)

  const logger = createLogger()
  for (const form of allForms) {
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
