/**
 * Maps API response data to a simplified structure based on YAML configuration
 *
 * This utility can be imported into existing controllers to transform
 * API responses based on simple path-to-key mappings defined in YAML metadata.
 */

/**
 * Creates a response mapper with optional dependencies
 * @returns {{ mapResponse: (responseMapping: Record<string, string>, response: object) => object }}
 */
export function createResponseMapper() {
  /**
   * Gets a nested value from an object
   * @param {object} obj - Source object
   * @param {string|undefined} path - Dot-notation path (e.g., 'data.business.info')
   * @returns {any}
   */
  function getValueByPath(obj, path) {
    if (!obj || !path) {
      return undefined
    }

    const parts = path.split('.')
    let current = obj

    for (const part of parts) {
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/)

      if (arrayMatch) {
        const [, arrayName, indexStr] = arrayMatch
        const index = parseInt(indexStr, 10)
        current = current?.[arrayName]?.[index]
      } else {
        current = current?.[part]
      }

      if (current === undefined || current === null) {
        return undefined
      }
    }

    return current
  }

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
      result[key] = getValueByPath(response, path)
    }

    return result
  }

  return { mapResponse }
}

const { mapResponse } = createResponseMapper()
export { mapResponse }
