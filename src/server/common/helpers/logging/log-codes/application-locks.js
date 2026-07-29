import { maskCrn } from '~/src/server/common/helpers/logging/mask-crn.js'

/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const APPLICATION_LOCKS = {
  RELEASE_SKIPPED: {
    level: 'debug',
    messageFunc: ({ ownerId, reason }) =>
      `Application locks release skipped | CRN=${maskCrn(ownerId)} | reason=${reason}`
  },
  RELEASE_ATTEMPTED: {
    level: 'debug',
    messageFunc: ({ ownerId }) => `Attempting application locks release | CRN=${maskCrn(ownerId)}`
  },
  RELEASE_SUCCEEDED: {
    level: 'debug',
    messageFunc: ({ ownerId, releasedCount }) =>
      `Application locks released | CRN=${maskCrn(ownerId)} | releasedCount=${releasedCount}`
  },
  RELEASE_TIMEOUT: {
    level: 'warn',
    messageFunc: ({ ownerId, timeoutMs }) =>
      `Application locks release timed out | CRN=${maskCrn(ownerId)} | timeoutMs=${timeoutMs}`
  },
  RELEASE_FAILED: {
    level: 'error',
    messageFunc: ({ ownerId, errorName, errorMessage }) =>
      `Failed to release application locks | CRN=${maskCrn(ownerId)} | errorName=${errorName} | errorMessage=${errorMessage}`
  }
}
