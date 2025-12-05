/** @typedef {import('./types.js').ClientInterface} ClientInterface */

class DataFetchingService {
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

  async fetch(queryObject) {
    return await this.apiClient.fetch(queryObject)
  }
}

export default DataFetchingService
