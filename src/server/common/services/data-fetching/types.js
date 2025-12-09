/**
 * @typedef {object} ClientInterface
 * @property {function(QueryObject): Promise<any>} fetch - Method to fetch data based on a query
 */

/**
 * @typedef {object} QueryObject
 * @property {string|object} query
 * @property {function(object): any} formatResponse
 */

/**
 * @typedef {Object} FetchRequestHeaders
 * @property {string} [Content-Type] - The Content-Type header
 * @property {string} [Authorization] - The Authorization header
 * @property {string} [Accept] - The Accept header
 * @property {string} [User-Agent] - The User-Agent header
 */

/**
 * @typedef {Object} FetchRequestOptions
 * @property {string} [method] - HTTP method (GET, POST, etc.)
 * @property {FetchRequestHeaders} [headers] - HTTP headers
 * @property {object|string} [body] - Request body
 */
