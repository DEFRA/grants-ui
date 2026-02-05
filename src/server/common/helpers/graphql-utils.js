/**
 * Escapes a string for safe use in a GraphQL query string literal
 * @param {string} value - The value to escape
 * @returns {string} The escaped value
 */
export function escapeGraphQLString(value) {
  return String(value)
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll('\n', String.raw`\n`)
    .replaceAll('\r', String.raw`\r`)
    .replaceAll('\t', String.raw`\t`)
}
