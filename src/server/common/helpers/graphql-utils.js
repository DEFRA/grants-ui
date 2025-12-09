/**
 * Escapes a string for safe use in a GraphQL query string literal
 * @param {string} value - The value to escape
 * @returns {string} The escaped value
 */
export function escapeGraphQLString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
