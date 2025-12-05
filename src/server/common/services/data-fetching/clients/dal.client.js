/**
 * @typedef {import('../types.js').ClientInterface} ClientInterface
 * @typedef {import('../types.js').QueryObject} QueryObject
 * @typedef {import('../types.js').FetchRequestOptions} FetchRequestOptions
 * @typedef {import('../types.js').FetchRequestHeaders} FetchRequestHeaders
 */

import { getValidToken } from '~/src/server/common/helpers/entra/token-manager.js'
import { FetchClient } from '~/src/server/common/services/data-fetching/clients/fetch.client.js'

/**
 * @class
 * @implements {ClientInterface} ClientInterface
 */
export class DALClient extends FetchClient {
  async fetch(queryObject) {
    this.fetchOptions = {
      headers: {
        Authorization: `Bearer ${await getValidToken()}`
      }
    }

    return super.fetch(queryObject)
  }
}
