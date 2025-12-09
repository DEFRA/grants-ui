/**
 * @typedef {import('./types.js').ClientInterface} ClientInterface
 * @typedef {import('./types.js').QueryObject} QueryObject
 * */

class ExternalDataService {
  /**
   * @type {ClientInterface}
   */
  apiClient

  /**
   * @param {ClientInterface} apiClient
   */
  constructor(apiClient) {
    this.apiClient = apiClient
  }

  /**
   * @param {QueryObject} queryObject
   * @returns {Promise<*>}
   */
  async fetch(queryObject) {
    return await this.apiClient.fetch(queryObject)
  }
}

export default ExternalDataService
