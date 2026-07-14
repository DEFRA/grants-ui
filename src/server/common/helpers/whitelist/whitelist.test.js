import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import whitelist from './whitelist.js'
import { config } from '~/src/config/config.js'
import { mockHapiRequest, mockHapiResponseToolkit, mockHapiServer } from '~/src/__mocks__/hapi-mocks.js'
import { getStateWithDefinition } from '~/src/server/common/helpers/state/state-with-definition-context.js'
import { WhitelistServiceFactory } from '~/src/server/auth/services/whitelist.service.js'
import { log } from '~/src/server/common/helpers/logging/log.js'

vi.mock('~/src/config/config.js', () => ({ config: { get: vi.fn() } }))

vi.mock('~/src/server/common/helpers/state/state-with-definition-context.js', () => ({
  getStateWithDefinition: vi.fn()
}))

vi.mock('~/src/server/auth/services/whitelist.service.js', () => ({
  WhitelistServiceFactory: {
    getService: vi.fn()
  }
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    SYSTEM: {
      SERVER_ERROR: { level: 'error', messageFunc: vi.fn() },
      WHITELIST_CONFIG_INCOMPLETE: { level: 'error', messageFunc: vi.fn() },
      CRN_ENV_VAR_MISSING: { level: 'error', messageFunc: vi.fn() },
      SBI_ENV_VAR_MISSING: { level: 'error', messageFunc: vi.fn() }
    }
  }
}))

const TEST_WHITELIST_METADATA = {
  whitelistCrnEnvVar: 'TEST_WHITELIST_CRNS',
  whitelistSbiEnvVar: 'TEST_WHITELIST_SBIS'
}

const buildMockService = (validationResultOverrides = {}) => {
  const defaultValidation = {
    crnPassesValidation: true,
    sbiPassesValidation: true,
    hasCrnValidation: false,
    hasSbiValidation: false,
    overallAccess: true
  }
  const validation = { ...defaultValidation, ...validationResultOverrides }

  return {
    validateGrantAccess: vi.fn().mockReturnValue(validation),
    logWhitelistValidation: vi.fn()
  }
}

const mockEnvelope = (metadata) => {
  getStateWithDefinition.mockResolvedValue({ definition: { definition: { metadata } } })
}

const registerAndGetOnPostAuth = (server) => {
  whitelist.plugin.register(server)
  expect(server.ext).toHaveBeenCalledWith('onPostAuth', expect.any(Function))
  return server.ext.mock.calls[0][1]
}

describe('whitelist plugin', () => {
  let server
  let h

  beforeEach(() => {
    vi.clearAllMocks()
    server = mockHapiServer()
    h = mockHapiResponseToolkit()
    config.get.mockReturnValue([])
    process.env.TEST_WHITELIST_CRNS = '1101009926,1101010029'
    process.env.TEST_WHITELIST_SBIS = '105123456,105654321'
  })

  afterEach(() => {
    delete process.env.TEST_WHITELIST_CRNS
    delete process.env.TEST_WHITELIST_SBIS
    vi.resetModules()
  })

  it('should register onPostAuth extension', () => {
    whitelist.plugin.register(server)
    expect(server.ext).toHaveBeenCalledWith('onPostAuth', expect.any(Function))
  })

  it('should continue when request is not authenticated', async () => {
    const handler = registerAndGetOnPostAuth(server)

    const request = mockHapiRequest({
      auth: { isAuthenticated: false, credentials: {} }
    })

    const result = await handler(request, h)

    expect(result).toBe(h.continue)
    expect(getStateWithDefinition).not.toHaveBeenCalled()
    expect(WhitelistServiceFactory.getService).not.toHaveBeenCalled()
  })

  it('should continue without resolving metadata when the route has no form slug', async () => {
    const handler = registerAndGetOnPostAuth(server)

    const request = mockHapiRequest({
      path: '/home',
      params: {},
      auth: { isAuthenticated: true, credentials: { crn: '1101009926', sbi: '105123456' } }
    })

    const result = await handler(request, h)

    expect(result).toBe(h.continue)
    expect(getStateWithDefinition).not.toHaveBeenCalled()
    expect(WhitelistServiceFactory.getService).not.toHaveBeenCalled()
  })

  it('should continue when access is allowed and log validation with correct details', async () => {
    const handler = registerAndGetOnPostAuth(server)

    const testSlug = 'test-form'
    const testCrn = '1101009926'
    const testSbi = '105123456'
    const metadata = { ...TEST_WHITELIST_METADATA }

    mockEnvelope(metadata)

    const mockService = buildMockService({ overallAccess: true, hasCrnValidation: true, hasSbiValidation: true })
    WhitelistServiceFactory.getService.mockReturnValue(mockService)

    const request = mockHapiRequest({
      path: `/forms/${testSlug}`,
      params: { slug: testSlug },
      auth: { isAuthenticated: true, credentials: { crn: testCrn, sbi: testSbi } }
    })

    const result = await handler(request, h)

    expect(getStateWithDefinition).toHaveBeenCalledTimes(1)
    expect(getStateWithDefinition).toHaveBeenCalledWith(request)
    expect(WhitelistServiceFactory.getService).toHaveBeenCalledWith(metadata)
    expect(mockService.validateGrantAccess).toHaveBeenCalledWith(testCrn, testSbi)

    expect(mockService.logWhitelistValidation).toHaveBeenCalledWith({
      crn: testCrn,
      sbi: testSbi,
      path: request.path,
      crnPassesValidation: true,
      sbiPassesValidation: true,
      hasCrnValidation: true,
      hasSbiValidation: true
    })

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('should redirect to unauthorised when access is denied', async () => {
    const handler = registerAndGetOnPostAuth(server)

    const testSlug = 'test-form'
    const testCrn = '1101010029'
    const testSbi = '105654321'

    mockEnvelope({ ...TEST_WHITELIST_METADATA })

    const mockService = buildMockService({ overallAccess: false, crnPassesValidation: false, hasCrnValidation: true })
    WhitelistServiceFactory.getService.mockReturnValue(mockService)

    const sendAuditEvent = vi.fn().mockResolvedValue(undefined)
    const request = mockHapiRequest({
      path: `/forms/${testSlug}`,
      params: { slug: testSlug },
      auth: { isAuthenticated: true, credentials: { crn: testCrn, sbi: testSbi } },
      sendAuditEvent
    })

    const result = await handler(request, h)

    expect(mockService.validateGrantAccess).toHaveBeenCalledWith(testCrn, testSbi)
    expect(mockService.logWhitelistValidation).toHaveBeenCalled()

    expect(sendAuditEvent).toHaveBeenCalledWith({
      action: 'unauthorised',
      status: 'denied',
      details: {
        reason: 'allowlist',
        crnPassesValidation: false,
        sbiPassesValidation: true
      }
    })

    expect(h.redirect).toHaveBeenCalledWith('/auth/journey-unauthorised')
    expect(h.takeover).toHaveBeenCalled()
    expect(result).toBe(h)
  })

  it('should not send an audit event when access is allowed', async () => {
    const handler = registerAndGetOnPostAuth(server)

    const testSlug = 'test-form'
    mockEnvelope({ ...TEST_WHITELIST_METADATA })

    const mockService = buildMockService({ overallAccess: true })
    WhitelistServiceFactory.getService.mockReturnValue(mockService)

    const sendAuditEvent = vi.fn().mockResolvedValue(undefined)
    const request = mockHapiRequest({
      path: `/forms/${testSlug}`,
      params: { slug: testSlug },
      auth: { isAuthenticated: true, credentials: { crn: '1101009926', sbi: '105123456' } },
      sendAuditEvent
    })

    const result = await handler(request, h)

    expect(sendAuditEvent).not.toHaveBeenCalled()
    expect(result).toBe(h.continue)
  })

  it('should skip whitelist and continue when grant code is in backendAllowlistEnabledSlugs', async () => {
    const handler = registerAndGetOnPostAuth(server)
    config.get.mockReturnValue(['woodland'])

    const request = mockHapiRequest({
      path: '/woodland/tasks',
      params: { slug: 'woodland' },
      auth: { isAuthenticated: true, credentials: { crn: '1100946179', sbi: '115371673' } }
    })

    const result = await handler(request, h)

    expect(getStateWithDefinition).not.toHaveBeenCalled()
    expect(WhitelistServiceFactory.getService).not.toHaveBeenCalled()
    expect(result).toBe(h.continue)
  })

  it('should handle an unknown form slug gracefully (metadata undefined)', async () => {
    const handler = registerAndGetOnPostAuth(server)

    const testCrn = '1101009926'
    const testSbi = '105123456'

    // Backend has no definition for this slug: the combined endpoint 404s and
    // the fetch helper resolves to null.
    getStateWithDefinition.mockResolvedValue(null)

    const mockService = buildMockService({ overallAccess: true })
    WhitelistServiceFactory.getService.mockReturnValue(mockService)

    const request = mockHapiRequest({
      path: '/forms/missing-form',
      params: { slug: 'missing-form' },
      auth: { isAuthenticated: true, credentials: { crn: testCrn, sbi: testSbi } }
    })

    const result = await handler(request, h)

    expect(WhitelistServiceFactory.getService).toHaveBeenCalledWith(undefined)
    expect(mockService.validateGrantAccess).toHaveBeenCalledWith(testCrn, testSbi)
    expect(result).toBe(h.continue)
  })

  it('should fail closed when only one whitelist env var is declared', async () => {
    const handler = registerAndGetOnPostAuth(server)

    mockEnvelope({ whitelistCrnEnvVar: 'TEST_WHITELIST_CRNS' })

    const request = mockHapiRequest({
      path: '/forms/test-form',
      params: { slug: 'test-form' },
      auth: { isAuthenticated: true, credentials: { crn: '1101009926', sbi: '105123456' } }
    })

    await expect(handler(request, h)).rejects.toThrow(/Incomplete whitelist configuration/)
    expect(WhitelistServiceFactory.getService).not.toHaveBeenCalled()
  })

  it('should fail closed when the declared CRN env var is not set in the environment', async () => {
    const handler = registerAndGetOnPostAuth(server)

    delete process.env.TEST_WHITELIST_CRNS
    mockEnvelope({ ...TEST_WHITELIST_METADATA })

    const request = mockHapiRequest({
      path: '/forms/test-form',
      params: { slug: 'test-form' },
      auth: { isAuthenticated: true, credentials: { crn: '1101009926', sbi: '105123456' } }
    })

    await expect(handler(request, h)).rejects.toThrow(
      'CRN whitelist environment variable TEST_WHITELIST_CRNS is defined in form test-form but not configured in environment'
    )
    expect(WhitelistServiceFactory.getService).not.toHaveBeenCalled()
  })

  it('should fail closed when the declared SBI env var is not set in the environment', async () => {
    const handler = registerAndGetOnPostAuth(server)

    delete process.env.TEST_WHITELIST_SBIS
    mockEnvelope({ ...TEST_WHITELIST_METADATA })

    const request = mockHapiRequest({
      path: '/forms/test-form',
      params: { slug: 'test-form' },
      auth: { isAuthenticated: true, credentials: { crn: '1101009926', sbi: '105123456' } }
    })

    await expect(handler(request, h)).rejects.toThrow(
      'SBI whitelist environment variable TEST_WHITELIST_SBIS is defined in form test-form but not configured in environment'
    )
    expect(WhitelistServiceFactory.getService).not.toHaveBeenCalled()
  })

  it('should continue with no metadata when the backend envelope cannot be resolved', async () => {
    const handler = registerAndGetOnPostAuth(server)

    getStateWithDefinition.mockRejectedValue(new Error('backend unavailable'))

    const mockService = buildMockService({ overallAccess: true })
    WhitelistServiceFactory.getService.mockReturnValue(mockService)

    const request = mockHapiRequest({
      path: '/forms/test-form',
      params: { slug: 'test-form' },
      auth: { isAuthenticated: true, credentials: { crn: '1101009926', sbi: '105123456' } }
    })

    const result = await handler(request, h)

    expect(WhitelistServiceFactory.getService).toHaveBeenCalledWith(undefined)
    expect(log).toHaveBeenCalled()
    expect(result).toBe(h.continue)
  })
})
