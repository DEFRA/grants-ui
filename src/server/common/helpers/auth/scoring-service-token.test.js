import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { getWebIdentityTokenProvider, getServiceToken } from './service-token.js'
import { clearCachedScoringServiceToken, getScoringServiceToken } from './scoring-service-token.js'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

vi.mock('./service-token.js', () => ({
  getWebIdentityTokenProvider: vi.fn(),
  getServiceToken: vi.fn()
}))

describe('scoring-service-token', () => {
  beforeEach(() => {
    clearCachedScoringServiceToken()
    config.get.mockReturnValue('grants-scoring-api')
    getWebIdentityTokenProvider.mockClear()
    getServiceToken.mockClear()
  })

  describe('getScoringServiceToken', () => {
    test('creates the provider with the configured audience and an early-refresh window covering a request', async () => {
      const mockProvider = { getCredentials: vi.fn() }
      getWebIdentityTokenProvider.mockReturnValue(mockProvider)
      getServiceToken.mockResolvedValue('a-token')

      const token = await getScoringServiceToken()

      expect(token).toBe('a-token')
      expect(config.get).toHaveBeenCalledWith('scoring.serviceAuth.audience')
      expect(getWebIdentityTokenProvider).toHaveBeenCalledWith('grants-scoring-api', 20_000)
      expect(getServiceToken).toHaveBeenCalledWith(mockProvider, 'grants-scoring-api', 'grants-scoring-api')
    })

    test('reuses the same provider instance across calls', async () => {
      const mockProvider = { getCredentials: vi.fn() }
      getWebIdentityTokenProvider.mockReturnValue(mockProvider)
      getServiceToken.mockResolvedValue('a-token')

      await getScoringServiceToken()
      await getScoringServiceToken()

      expect(getWebIdentityTokenProvider).toHaveBeenCalledTimes(1)
      expect(getServiceToken).toHaveBeenCalledTimes(2)
    })
  })
})
