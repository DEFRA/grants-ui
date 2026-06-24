import { describe, it, expect, vi, beforeEach } from 'vitest'
import Jwt from '@hapi/jwt'
import { fetchAllowedGrants } from './allowlist.client.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'
import { createApiHeadersForGrantsUiBackend } from '~/src/server/common/helpers/auth/backend-auth-helper.js'
import { createMockFetchResponse, mockFetch } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('@hapi/jwt')
vi.mock('~/src/server/common/helpers/logging/upstream-error.js', () => ({ logUpstreamError: vi.fn() }))
vi.mock('~/src/server/common/helpers/auth/backend-auth-helper.js', () => ({
  createApiHeadersForGrantsUiBackend: vi.fn().mockReturnValue({ Authorization: 'Bearer test-token' })
}))
vi.mock('~/src/config/config.js', async () => {
  const { mockConfig } = await import('~/src/__mocks__/index.js')
  return mockConfig({
    'session.cache.apiEndpoint': 'http://backend',
    'session.cache.jwtSecret': 'test-jwt-secret'
  })
})

const CRN = '1234567890'
const SBI = '123456789'

describe('fetchAllowedGrants', () => {
  let fetch

  beforeEach(() => {
    vi.clearAllMocks()
    fetch = mockFetch()
    Jwt.token.generate.mockReturnValue('mocked-encrypted-auth')
  })

  it('signs the x-encrypted-auth JWT with crn and sbi', async () => {
    fetch.mockResolvedValue(createMockFetchResponse({ data: { grants: [] } }))

    await fetchAllowedGrants(CRN, SBI)

    expect(Jwt.token.generate).toHaveBeenCalledWith({ crn: CRN, sbi: SBI }, 'test-jwt-secret')
  })

  it('sends GET to /allowlist/grants with the correct headers', async () => {
    fetch.mockResolvedValue(createMockFetchResponse({ data: { grants: [] } }))

    await fetchAllowedGrants(CRN, SBI)

    expect(fetch).toHaveBeenCalledWith('http://backend/allowlist/grants', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-token',
        'x-encrypted-auth': 'mocked-encrypted-auth'
      }
    })
    expect(createApiHeadersForGrantsUiBackend).toHaveBeenCalled()
  })

  it('returns an array of grant codes from the response', async () => {
    fetch.mockResolvedValue(
      createMockFetchResponse({
        data: {
          grants: [
            { code: 'woodland', title: 'Woodland Management Plan' },
            { code: 'farm-payments', title: 'Farm payments' }
          ]
        }
      })
    )

    const result = await fetchAllowedGrants(CRN, SBI)

    expect(result).toEqual(['woodland', 'farm-payments'])
  })

  it('returns an empty array when the user has no permitted grants', async () => {
    fetch.mockResolvedValue(createMockFetchResponse({ data: { grants: [] } }))

    const result = await fetchAllowedGrants(CRN, SBI)

    expect(result).toEqual([])
  })

  it('returns an empty array when grants key is missing from the response', async () => {
    fetch.mockResolvedValue(createMockFetchResponse({ data: {} }))

    const result = await fetchAllowedGrants(CRN, SBI)

    expect(result).toEqual([])
  })

  it('throws and logs when the response is not ok', async () => {
    fetch.mockResolvedValue(
      createMockFetchResponse({
        ok: false,
        status: 401,
        statusText: 'Unauthorised',
        data: { message: 'Invalid authentication credentials' }
      })
    )

    await expect(fetchAllowedGrants(CRN, SBI)).rejects.toThrow('Invalid authentication credentials')
    expect(logUpstreamError).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/allowlist/grants', upstreamStatus: 401 })
    )
  })

  it('falls back to statusText when error response has no json message', async () => {
    fetch.mockResolvedValue(
      createMockFetchResponse({ ok: false, status: 500, statusText: 'Internal Server Error', data: null })
    )

    await expect(fetchAllowedGrants(CRN, SBI)).rejects.toThrow('Internal Server Error')
  })

  it('throws and logs on network failure', async () => {
    fetch.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(fetchAllowedGrants(CRN, SBI)).rejects.toThrow('ECONNREFUSED')
    expect(logUpstreamError).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/allowlist/grants', upstreamStatus: null, errorMessage: 'ECONNREFUSED' })
    )
  })
})
