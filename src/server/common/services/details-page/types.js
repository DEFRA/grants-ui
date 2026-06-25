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

/**
 * @typedef {object} DisplayFieldConfig
 * @property {string} label - The label shown in the summary list key
 * @property {string} [sourcePath] - Dot-notation path to the value in mapped data
 * @property {string[]} [sourcePaths] - Multiple paths for multi-value fields
 * @property {string} [sourceType] - "data" (default) or "credentials"
 * @property {string} [format] - Formatter name: "text", "fullName", "address", "contactDetails"
 * @property {boolean} [hideIfEmpty] - If true (default), row is hidden when value is empty
 */
