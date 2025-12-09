/**
 * Maps API response data to a simplified structure based on YAML configuration
 *
 * This utility can be imported into existing controllers to transform
 * API responses based on simple path-to-key mappings defined in YAML metadata.
 */

import { resolvePath } from '~/src/server/common/helpers/path-utils.js'

/**
 * Creates a response mapper with optional dependencies
 * @returns {{ mapResponse: (responseMapping: Record<string, string>, response: object) => object }}
 */
export function createResponseMapper() {
  /**
   * Maps API response to a new structure based on YAML configuration
   *
   * @param {Record<string, string>} responseMapping - Key-to-path mapping from YAML
   * @param {object} response - Raw API response
   * @returns {object} Mapped response object
   */
  function mapResponse(responseMapping, response) {
    const result = {}

    for (const [key, path] of Object.entries(responseMapping)) {
      result[key] = resolvePath(response, path)
    }

    return result
  }

  return { mapResponse }
}

const { mapResponse } = createResponseMapper()
export { mapResponse }
