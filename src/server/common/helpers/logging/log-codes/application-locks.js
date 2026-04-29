/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const APPLICATION_LOCKS = {
  RELEASE_SKIPPED: {
    level: 'debug',
    messageFunc: ({ ownerId, reason }) => `Application locks release skipped | ownerId=${ownerId} | reason=${reason}`
  },
  RELEASE_ATTEMPTED: {
    level: 'debug',
    messageFunc: ({ ownerId }) => `Attempting application locks release | ownerId=${ownerId}`
  },
  RELEASE_SUCCEEDED: {
    level: 'debug',
    messageFunc: ({ ownerId, releasedCount }) =>
      `Application locks released | ownerId=${ownerId} | releasedCount=${releasedCount}`
  },
  RELEASE_TIMEOUT: {
    level: 'warn',
    messageFunc: ({ ownerId, timeoutMs }) =>
      `Application locks release timed out | ownerId=${ownerId} | timeoutMs=${timeoutMs}`
  },
  RELEASE_FAILED: {
    level: 'error',
    messageFunc: ({ ownerId, errorName, errorMessage }) =>
      `Failed to release application locks | ownerId=${ownerId} | errorName=${errorName} | errorMessage=${errorMessage}`
  }
}
