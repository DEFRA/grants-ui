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
      ...customCodes.AUTH
    },
    SYSTEM: {
      SERVER_ERROR: { level: 'error', messageFunc: vi.fn() },
      ...customCodes.SYSTEM
    },
    ...customCodes
  }
})

// Simple logger mock without custom methods (for basic cases)
export const mockLoggerSimple = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})

// Request logger mock for request.logger patterns
export const mockRequestLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})

// Server logger mock for server.logger patterns
export const mockServerLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})
