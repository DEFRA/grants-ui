/**
 * @typedef {import('./types.js').QueryConfig} QueryConfig
 * @typedef {import('./types.js').QueryEntityConfig} QueryEntityConfig
 * @typedef {import('./types.js').QueryFieldConfig} QueryFieldConfig
 */

import { escapeGraphQLString } from '~/src/server/common/helpers/graphql-utils.js'
import { resolvePath } from '~/src/server/common/helpers/path-utils.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { BaseError } from '~/src/server/common/utils/errors/BaseError.js'

export class GraphQLQueryBuilderError extends BaseError {}

/**
 * Helper to throw config errors
 * @param {string} message
 * @param {string} reason
 * @throws {GraphQLQueryBuilderError}
 */
function throwConfigError(message, reason) {
  throw new GraphQLQueryBuilderError({ message, status: statusCodes.internalServerError, source: 'config', reason })
}

/**
 * Validates a field configuration recursively
 * @param {QueryFieldConfig} field - The field to validate
 * @param {string} context - Context path for error messages (e.g., 'customer.info')
 */
function validateFieldConfig(field, context) {
  if (!field.path || typeof field.path !== 'string') {
    throwConfigError(`Field at '${context}' must have a path property`, 'missing_field_path')
  }

  const fieldContext = context ? `${context}.${field.path}` : field.path

  if (field.fields !== undefined) {
    if (!Array.isArray(field.fields)) {
      throwConfigError(
        `Field '${fieldContext}' has invalid fields property (must be an array)`,
        'invalid_nested_fields'
      )
    }

    for (const nestedField of field.fields) {
      validateFieldConfig(nestedField, fieldContext)
    }
  }
}

/**
 * Validates an entity configuration
 * @param {QueryEntityConfig} entity - The entity to validate
 */
function validateEntityConfig(entity) {
  if (!entity.name || typeof entity.name !== 'string') {
    throwConfigError('Entity must have a name', 'missing_entity_name')
  }

  if (!entity.variableName || typeof entity.variableName !== 'string') {
    throwConfigError(`Entity '${entity.name}' must have a variableName`, 'missing_variable_name')
  }

  if (!entity.variableSource || typeof entity.variableSource !== 'string') {
    throwConfigError(`Entity '${entity.name}' must have a variableSource`, 'missing_variable_source')
  }

  if (!Array.isArray(entity.fields) || entity.fields.length === 0) {
    throwConfigError(`Entity '${entity.name}' must have a non-empty fields array`, 'missing_entity_fields')
  }

  for (const field of entity.fields) {
    validateFieldConfig(field, entity.name)
  }
}

/**
 * Validates a query configuration object
 * Call this at config load time to catch configuration errors early
 * @param {QueryConfig} config - The query configuration to validate
 * @throws {GraphQLQueryBuilderError} If the configuration is invalid
 */
export function validateQueryConfig(config) {
  if (!config || typeof config !== 'object') {
    throwConfigError('Query config must be an object', 'invalid_config')
  }

  if (!config.name || typeof config.name !== 'string') {
    throwConfigError('Query config must have a name', 'missing_query_name')
  }

  if (!Array.isArray(config.entities) || config.entities.length === 0) {
    throwConfigError('Query config must have at least one entity', 'missing_entities')
  }

  for (const entity of config.entities) {
    validateEntityConfig(entity)
  }
}

/**
 * Builds a nested field selection string from field configs
 * @param {QueryFieldConfig[]} fields
 * @param {number} indent
 * @returns {string}
 */
function buildFieldSelection(fields, indent = 0) {
  const indentation = '  '.repeat(indent)
  const lines = []

  for (const field of fields) {
    if (field.fields && field.fields.length > 0) {
      lines.push(`${indentation}${field.path} {`, buildFieldSelection(field.fields, indent + 1), `${indentation}}`)
    } else {
      lines.push(`${indentation}${field.path}`)
    }
  }

  return lines.join('\n')
}

/**
 * Resolves a variable value from credentials
 * @param {string|undefined} source - Source path (e.g., 'credentials.sbi')
 * @param {object} credentials - The credentials object
 * @returns {string|undefined} The resolved value as string, or undefined
 */
function resolveVariable(source, credentials) {
  if (!source) {
    return undefined
  }

  // Strip 'credentials.' prefix if present
  const path = source.startsWith('credentials.') ? source.slice('credentials.'.length) : source

  const value = resolvePath(credentials, path)

  if (value === null || value === undefined) {
    return undefined
  }

  return String(value)
}

/**
 * Builds a GraphQL query string from YAML configuration
 *
 * @param {QueryConfig} config - Query configuration from YAML
 * @param {object} request - Hapi request object for resolving variables
 * @returns {string} GraphQL query string
 */
export function buildGraphQLQuery(config, request) {
  const credentials = request.auth?.credentials
  const lines = [`query ${config.name} {`]

  for (const entity of config.entities) {
    const variableValue = resolveVariable(entity.variableSource, credentials)

    if (variableValue === undefined) {
      throw new GraphQLQueryBuilderError({
        message: entity.variableSource
          ? `Could not resolve variable from source '${entity.variableSource}'`
          : 'Variable source is required but was not provided',
        status: statusCodes.badRequest,
        source: entity.variableSource,
        reason: entity.variableSource ? 'path_not_found' : 'missing_source'
      })
    }

    const escapedVariableValue = escapeGraphQLString(variableValue)
    lines.push(
      `  ${entity.name}(${entity.variableName}: "${escapedVariableValue}") {`,
      buildFieldSelection(entity.fields, 2),
      '  }'
    )
  }

  lines.push('}')

  return lines.join('\n')
}
