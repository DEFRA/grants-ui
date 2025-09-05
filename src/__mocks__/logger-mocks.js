import { vi } from 'vitest'

export const mockLoggerFactory = () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }))
})

export const mockLoggerFactoryWithCustomMethods = (customMethods = {}) => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    ...customMethods
  }))
})

export const mockLogHelper = () => ({
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
