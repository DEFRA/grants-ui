/**
 * @typedef {object} QueryFieldConfig
 * @property {string} path - The GraphQL field path
 * @property {QueryFieldConfig[]} [fields] - Nested fields
 */

/**
 * @typedef {object} QueryEntityConfig
 * @property {string} name - Entity name (e.g. 'customer', 'business')
 * @property {string} [variableName] - Variable name for the entity (e.g., 'crn', 'sbi')
 * @property {string} [variableSource] - Source path for the variable value (e.g., 'credentials.crn')
 * @property {QueryFieldConfig[]} fields - Fields to query
 */

/**
 * @typedef {object} QueryConfig
 * @property {string} name - Query operation name
 * @property {QueryEntityConfig[]} entities - Entities to query
 */
