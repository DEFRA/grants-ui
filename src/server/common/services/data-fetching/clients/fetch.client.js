/**
 * @typedef {import('../types.js').ClientInterface} ClientInterface
 * @typedef {import('../types.js').QueryObject} QueryObject
 * @typedef {import('../types.js').FetchRequestOptions} FetchRequestOptions
 * @typedef {import('../types.js').FetchRequestHeaders} FetchRequestHeaders
 */

import { deepMerge } from '~/src/server/common/utils/deepMerge.js'

/**
 * @class
 * @implements {ClientInterface} ClientInterface
 */
export class FetchClient {
  /**
   * @type {URL} endpoint
   */
  endpoint

  /**
   *
   * @type {FetchRequestOptions}
   * @private
   */
  _fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }

  /**
   * @param {URL} endpoint
   */
  constructor(endpoint) {
    this.endpoint = endpoint
  }

  /**
   * Executes a query against the DAL service.
   * @async
   * @param {QueryObject} queryObject - The query string or object
   * @returns {Promise<any>} The response from the DAL service
   */
  async fetch(queryObject) {
    this.fetchOptions = {
      body: {
        query: JSON.stringify(queryObject.query)
      }
    }

    return await fetch(this.endpoint, this.fetchOptions)
  }

  /**
   * Resets fetch options to default values.
   */
  resetFetchOptions() {
    this._fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  }

  /**
   * @param {FetchRequestOptions} options
   */
  set fetchOptions(options) {
    this._fetchOptions = deepMerge(this._fetchOptions, options)
  }

  /**
   * @returns {FetchRequestOptions}
   */
  get fetchOptions() {
    return this._fetchOptions
  }
}
