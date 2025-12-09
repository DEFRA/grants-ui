/**
 * @typedef {import('../types.js').ClientInterface} ClientInterface
 * @typedef {import('../types.js').QueryObject} QueryObject
 */

import fs from 'node:fs/promises'

/**
 * @class
 * @implements {ClientInterface}
 */
export class FileReaderClient {
  /**
   * Fetches file content based on the provided query
   * @param {QueryObject} queryObject - The query object containing file path
   * @returns {Promise<any>} The formatted response with file data
   */
  async fetch(queryObject) {
    if (typeof queryObject.query !== 'string') {
      return Promise.reject(new Error('For a fileReader client, query must be a string representing the file path'))
    }

    try {
      const data = await fs.readFile(queryObject.query, 'utf8')

      // Use formatResponse if provided
      if (typeof queryObject.formatResponse === 'function') {
        return queryObject.formatResponse({ data })
      }

      return { data }
    } catch (error) {
      return Promise.reject(error)
    }
  }
}
