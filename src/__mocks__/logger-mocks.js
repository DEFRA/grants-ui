import { vi } from 'vitest'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes-definition.js'

export const mockLoggerFactory = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})

export const mockLoggerFactoryWithCustomMethods = (customMethods = {}) => ({
  ...mockLoggerFactory(),
  ...customMethods
})

/**
 * @typedef {Object} MockLogCodesDefinition
 * @property {import('~/src/server/common/helpers/logging/log-codes-definition.js').LogTypes.LogLevel} level
 * @property {import('vitest').Mock} messageFunc
 */

/**
 * Auto-generate mock LogCodes from real LogCodes
 * Each messageFunc becomes a vi.fn() for test assertions
 * @param {typeof import('~/src/server/common/helpers/logging/log-codes-definition.js').LogCodes} codes
 * @returns {Record<string, Record<string, MockLogCodesDefinition>>}
 */
const autoMockLogCodes = (codes) =>
  Object.fromEntries(
    Object.entries(codes).map(([category, entries]) => [
      category,
      Object.fromEntries(
        Object.entries(entries).map(([name, code]) => [name, { level: code.level, messageFunc: vi.fn() }])
      )
    ])
  )

export const MockLogCodes = autoMockLogCodes(LogCodes)

/**
 * Standard mock for the log helper module
 * Usage: vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
 *   const { mockLogHelper } = await import('~/src/__mocks__')
 *   return mockLogHelper()
 * })
 */
export const mockLogHelper = () => ({
  logger: mockLoggerFactory(),
  log: vi.fn(),
  LogCodes: MockLogCodes
})

export const mockLogCodesHelper = () => ({
  LogCodes: MockLogCodes
})

export const mockRequestLogger = () => mockLoggerFactory()
