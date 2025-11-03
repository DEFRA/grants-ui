import { vi } from 'vitest'

export const mockLoggerFactory = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})

export const mockLoggerFactoryWithCustomMethods = (customMethods = {}) => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  ...customMethods
})

export const mockLogHelper = () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  },
  log: vi.fn(),
  LogCodes: {
    AUTH: {
      SESSION_EXPIRED: { level: 'info', messageFunc: vi.fn() },
      TOKEN_VERIFICATION_SUCCESS: { level: 'info', messageFunc: vi.fn() },
      TOKEN_VERIFICATION_FAILURE: { level: 'error', messageFunc: vi.fn() },
      AUTH_DEBUG: { level: 'debug', messageFunc: vi.fn() },
      SIGN_IN_FAILURE: { level: 'error', messageFunc: vi.fn() },
      UNAUTHORIZED_ACCESS: { level: 'error', messageFunc: vi.fn() }
    },
    SYSTEM: {
      SERVER_ERROR: { level: 'error', messageFunc: vi.fn() }
    },
    RESOURCE_NOT_FOUND: {
      FORM_NOT_FOUND: { level: 'info', messageFunc: vi.fn() },
      TASKLIST_NOT_FOUND: { level: 'info', messageFunc: vi.fn() },
      PAGE_NOT_FOUND: { level: 'info', messageFunc: vi.fn() }
    }
  }
})

export const mockLogHelperWithCustomCodes = (customCodes = {}) => ({
  log: vi.fn(),
  LogCodes: {
    AUTH: {
      SESSION_EXPIRED: { level: 'info', messageFunc: vi.fn() },
      TOKEN_VERIFICATION_SUCCESS: { level: 'info', messageFunc: vi.fn() },
      TOKEN_VERIFICATION_FAILURE: { level: 'error', messageFunc: vi.fn() },
      AUTH_DEBUG: { level: 'debug', messageFunc: vi.fn() },
      SIGN_IN_FAILURE: { level: 'error', messageFunc: vi.fn() },
      UNAUTHORIZED_ACCESS: { level: 'error', messageFunc: vi.fn() },
      ...(customCodes.AUTH || {})
    },
    SYSTEM: {
      SERVER_ERROR: { level: 'error', messageFunc: vi.fn() },
      ...(customCodes.SYSTEM || {})
    },
    ...Object.fromEntries(Object.entries(customCodes).filter(([key]) => key !== 'AUTH' && key !== 'SYSTEM'))
  }
})

export const mockLoggerSimple = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})

export const mockRequestLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})
