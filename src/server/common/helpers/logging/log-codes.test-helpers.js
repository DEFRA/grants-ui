import { expect, it } from 'vitest'
import { LogCodes } from './log-codes.js'

export const testLogCodes = (category, cases) =>
  it.each(cases)('should have valid %s log code', (name, expectedLevel, testParams, expectedMessage) => {
    const logCode = LogCodes[category][name.split(' ')[0]]
    expect(logCode.level).toBe(expectedLevel)
    expect(typeof logCode.messageFunc).toBe('function')
    expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
  })

export const getValidatedLogCode = (category, name, expectedLevel) => {
  const logCode = LogCodes[category][name]
  expect(logCode.level).toBe(expectedLevel)
  expect(typeof logCode.messageFunc).toBe('function')
  return logCode
}

export const TEST_USER_IDS = {
  DEFAULT: '1100943757',
  MASKED: '******3757',
  CONTACT_ID: '12345'
}

export const TEST_PATHS = {
  ADMIN: '/admin',
  AUTH_SIGN_IN_OIDC: '/auth/sign-in-oidc',
  EXAMPLE_GRANT: '/example-grant',
  TEST_PATH: '/test-path'
}

export const TEST_ERRORS = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  INVALID_TOKEN: 'Invalid token',
  NETWORK_ERROR: 'Network error',
  NO_TOKEN: 'No token provided',
  PROCESSING_FAILED: 'Processing failed',
  REQUIRED_FIELD: 'Required field missing',
  DATABASE_ERROR: 'Database connection failed',
  CONNECTION_FAILED: 'Connection failed',
  INVALID_DATA: 'Invalid data'
}

export const TEST_SESSIONS = {
  SESSION_123: 'session123'
}

export const TEST_ORGANIZATIONS = {
  DEFAULT: 'org'
}

export const TEST_GRANT_TYPES = {
  EXAMPLE_GRANT_WITH_AUTH: 'example-grant-with-auth'
}

export const TEST_FORM_NAMES = {
  DECLARATION: 'declaration'
}

export const TEST_REFERENCE_NUMBERS = {
  REF_123: 'REF123'
}

export const TEST_SBI = {
  DEFAULT: '106284736'
}

export const TEST_AGREEMENT_TYPES = {
  TERMS: 'terms'
}

export const TEST_ENDPOINTS = {
  API_GRANTS: 'http://example.com/api/grants',
  API_TEST: 'http://example.com/api/test'
}

export const TEST_PORTS = {
  DEFAULT: 3000
}

export const TEST_METHODS = {
  GET: 'GET',
  POST: 'POST'
}
