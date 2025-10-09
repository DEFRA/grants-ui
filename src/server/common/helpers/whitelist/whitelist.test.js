import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import whitelist from './whitelist.js'
import { mockHapiRequest, mockHapiResponseToolkit, mockHapiServer } from '~/src/__mocks__/hapi-mocks.js'
import { getAllForms } from '~/src/server/dev-tools/utils/index.js'
import { WhitelistServiceFactory } from '~/src/server/auth/services/whitelist.service.js'

vi.mock('~/src/server/dev-tools/utils/index.js', () => ({
  getAllForms: vi.fn()
}))

vi.mock('~/src/server/auth/services/whitelist.service.js', () => ({
  WhitelistServiceFactory: {
    getService: vi.fn()
  }
}))

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
  })

  afterEach(() => {
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
    expect(getAllForms).not.toHaveBeenCalled()
    expect(WhitelistServiceFactory.getService).not.toHaveBeenCalled()
  })

  it('should continue when access is allowed and log validation with correct details', async () => {
    const handler = registerAndGetOnPostAuth(server)

    const testSlug = 'test-form'
    const testCrn = '1101009926'
    const testSbi = '105123456'
    const metadata = { whitelistCrnEnvVar: 1234567890 }

    getAllForms.mockReturnValue([
      { slug: testSlug, metadata },
      { slug: 'other-form', metadata: { whitelistCrnEnvVar: 9876543210 } }
    ])

    const mockService = buildMockService({ overallAccess: true, hasCrnValidation: true, hasSbiValidation: true })
    WhitelistServiceFactory.getService.mockReturnValue(mockService)

    const request = mockHapiRequest({
      path: `/forms/${testSlug}`,
      params: { slug: testSlug },
      auth: { isAuthenticated: true, credentials: { crn: testCrn, sbi: testSbi } }
    })

    const result = await handler(request, h)

    expect(getAllForms).toHaveBeenCalledTimes(1)
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

    getAllForms.mockReturnValue([{ slug: testSlug, metadata: { whitelistCrnEnvVar: 0 } }])

    const mockService = buildMockService({ overallAccess: false, crnPassesValidation: false, hasCrnValidation: true })
    WhitelistServiceFactory.getService.mockReturnValue(mockService)

    const request = mockHapiRequest({
      path: `/forms/${testSlug}`,
      params: { slug: testSlug },
      auth: { isAuthenticated: true, credentials: { crn: testCrn, sbi: testSbi } }
    })

    const result = await handler(request, h)

    expect(mockService.validateGrantAccess).toHaveBeenCalledWith(testCrn, testSbi)
    expect(mockService.logWhitelistValidation).toHaveBeenCalled()

    expect(h.redirect).toHaveBeenCalledWith('/auth/journey-unauthorised')
    expect(h.takeover).toHaveBeenCalled()
    expect(result).toBe(h)
  })

  it('should handle missing form slug gracefully (metadata undefined)', async () => {
    const handler = registerAndGetOnPostAuth(server)

    const testCrn = '1101009926'
    const testSbi = '105123456'

    getAllForms.mockReturnValue([{ slug: 'different-form', metadata: { whitelistCrnEnvVar: 1234567890 } }])

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
})
