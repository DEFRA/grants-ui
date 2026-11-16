import { readGasApplicationStatus } from '../../common/request-pipeline/redirects/forms-status-redirect.js'

// The selector only displays what GAS says and tolerates not knowing, so one short attempt:
// the page must not hang on a slow GAS the way a journey redirect may wait for one.
const SELECTOR_GAS_RETRY = { maxAttempts: 1, timeout: 5000 }

/**
 * Reads the current GAS status of the given applications, in parallel. The caller decides which
 * applications are worth asking GAS about. A failed read leaves its application out of the result.
 *
 * @param {AnyRequest} request
 * @param {string} grantCode
 * @param {{ applicationRef: string }[]} applications
 * @returns {Promise<Map<string, string>>} GAS status by application reference
 */
export async function readGasStatuses(request, grantCode, applications) {
  const statuses = await Promise.all(
    applications.map((application) =>
      readGasApplicationStatus(request, grantCode, application.applicationRef, SELECTOR_GAS_RETRY)
    )
  )

  return new Map(
    applications.flatMap((application, index) =>
      statuses[index] === undefined ? [] : [[application.applicationRef, statuses[index]]]
    )
  )
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
