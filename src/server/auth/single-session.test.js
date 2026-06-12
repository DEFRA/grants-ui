import { vi, describe, test, expect, beforeEach } from 'vitest'
import { invalidatePreviousSession } from './single-session.js'
import { log } from '~/src/server/common/helpers/logging/log.js'

/** @import { MockedFunction } from 'vitest' */

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

/** @type {MockedFunction<typeof log>} */
const mockLog = /** @type {any} */ (log)

/**
 * @returns {{
 *   get: MockedFunction<(key: string) => Promise<unknown>>,
 *   set: MockedFunction<(key: string, value: unknown, ttl?: number) => Promise<void>>,
 *   drop: MockedFunction<(key: string) => Promise<void>>
 * }}
 */
function makeCache() {
  return {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    drop: vi.fn().mockResolvedValue(undefined)
  }
}

/**
 * @returns {{
 *   get: MockedFunction<(key: string) => Promise<string | null>>,
 *   set: MockedFunction<(key: string, value: string, ttl?: number) => Promise<void>>,
 *   drop: MockedFunction<(key: string) => Promise<void>>
 * }}
 */
function makeIndex() {
  return {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(undefined),
    drop: vi.fn().mockResolvedValue(undefined)
  }
}

describe('invalidatePreviousSession', () => {
  const contactId = 'crn-abc-123'
  const newSessionId = 'new-session-uuid'
  const previousSessionId = 'old-session-uuid'

  /** @type {ReturnType<typeof makeCache>} */
  let cache
  /** @type {ReturnType<typeof makeIndex>} */
  let userSessionIndex

  beforeEach(() => {
    vi.clearAllMocks()
    cache = makeCache()
    userSessionIndex = makeIndex()
  })

  test('no prior session: stores new index entry without dropping anything', async () => {
    userSessionIndex.get.mockResolvedValue(null)

    await invalidatePreviousSession(cache, userSessionIndex, contactId, newSessionId)

    expect(cache.drop).not.toHaveBeenCalled()
    expect(mockLog).not.toHaveBeenCalled()
    expect(userSessionIndex.set).toHaveBeenCalledWith(contactId, newSessionId)
  })

  test('prior session exists: drops old session, logs SESSION_INVALIDATED, stores new index entry', async () => {
    userSessionIndex.get.mockResolvedValue(previousSessionId)

    await invalidatePreviousSession(cache, userSessionIndex, contactId, newSessionId)

    expect(cache.drop).toHaveBeenCalledExactlyOnceWith(previousSessionId)
    expect(mockLog).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ level: 'info' }),
      expect.objectContaining({
        userId: contactId,
        previousSessionId,
        newSessionId
      })
    )
    expect(userSessionIndex.set).toHaveBeenCalledWith(contactId, newSessionId)
  })

  test('re-entrant sign-in: index already holds the new sessionId, no drop or log', async () => {
    userSessionIndex.get.mockResolvedValue(newSessionId)

    await invalidatePreviousSession(cache, userSessionIndex, contactId, newSessionId)

    expect(cache.drop).not.toHaveBeenCalled()
    expect(mockLog).not.toHaveBeenCalled()
    expect(userSessionIndex.set).toHaveBeenCalledWith(contactId, newSessionId)
  })

  test('index entry is always updated even when no prior session existed', async () => {
    userSessionIndex.get.mockResolvedValue(null)

    await invalidatePreviousSession(cache, userSessionIndex, contactId, newSessionId)

    expect(userSessionIndex.set).toHaveBeenCalledWith(contactId, newSessionId)
  })
})
