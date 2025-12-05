/**
 * Builds GraphQL queries from YAML configuration objects
 *
 * This utility can be imported into existing controllers to build
 * GraphQL queries based on configuration defined in YAML metadata.
 */

/**
 * @typedef {object} QueryFieldConfig
 * @property {string} path - The GraphQL field path
 * @property {QueryFieldConfig[]} [fields] - Nested fields
 */

/**
 * @typedef {object} QueryEntityConfig
 * @property {string} name - Entity name (e.g., 'customer', 'business')
 * @property {string} [variableName] - Variable name for the entity (e.g., 'crn', 'sbi')
 * @property {string} [variableSource] - Source path for the variable value (e.g., 'credentials.crn')
 * @property {QueryFieldConfig[]} fields - Fields to query
 */

/**
 * @typedef {object} QueryConfig
 * @property {string} name - Query operation name
 * @property {QueryEntityConfig[]} entities - Entities to query
 */

/**
 * Creates a GraphQL query builder with optional dependencies
 * @returns {{ buildGraphQLQuery: (config: QueryConfig, request: object) => string }}
 */
export function createGraphQLQueryBuilder() {
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
        lines.push(`${indentation}${field.path} {`)
        lines.push(buildFieldSelection(field.fields, indent + 1))
        lines.push(`${indentation}}`)
      } else {
        lines.push(`${indentation}${field.path}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Resolves a variable value from the request context
   * @param {string|undefined} source - Source path (e.g., 'credentials.sbi')
   * @param {object} request - Hapi request object
   * @returns {string}
   */
  function resolveVariable(source, request) {
    if (!source) {
      return ''
    }

    const parts = source.split('.')
    let value = request

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part]
      } else if (part === 'credentials' && request.auth?.credentials) {
        value = request.auth.credentials
      } else {
        return ''
      }
    }

    return String(value ?? '')
  }

  /**
   * Builds a GraphQL query string from YAML configuration
   *
   * @param {QueryConfig} config - Query configuration from YAML
   * @param {object} request - Hapi request object for resolving variables
   * @returns {string} GraphQL query string
   */
  function buildGraphQLQuery(config, request) {
    const lines = [`query ${config.name} {`]

    for (const entity of config.entities) {
      const variableValue = resolveVariable(entity.variableSource, request)
      lines.push(`  ${entity.name}(${entity.variableName}: "${variableValue}") {`)
      lines.push(buildFieldSelection(entity.fields, 2))
      lines.push('  }')
    }

    lines.push('}')

    return lines.join('\n')
  }

  return { buildGraphQLQuery }
}

const { buildGraphQLQuery } = createGraphQLQueryBuilder()
export { buildGraphQLQuery }
