import { describe, it, expect, vi, beforeEach } from 'vitest'
import entraIdPlugin from './index.js'
import { getEntraIdOptions } from './entra-id-strategy.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

vi.mock('./entra-id-strategy.js')
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: { AUTH: { ENTRA_ID_AUTH_FAILURE: 'ENTRA_ID_AUTH_FAILURE' } }
}))

describe('entra-id-auth plugin', () => {
  let server

  beforeEach(() => {
    server = {
      auth: {
        strategy: vi.fn()
      },
      route: vi.fn()
    }
    vi.clearAllMocks()
  })

  it('should have the correct name', () => {
    expect(entraIdPlugin.plugin.name).toBe('entra-id-auth')
  })

  it('should register the entra-id strategy and route', async () => {
    const mockOptions = { provider: 'entra-id' }
    getEntraIdOptions.mockResolvedValue(mockOptions)

    await entraIdPlugin.plugin.register(server)

    expect(getEntraIdOptions).toHaveBeenCalled()
    expect(server.auth.strategy).toHaveBeenCalledWith('entra-id', 'bell', mockOptions)
    expect(server.route).toHaveBeenCalledWith(
      expect.objectContaining({
        method: ['GET', 'POST'],
        path: '/auth'
      })
    )
  })

  describe('handler', () => {
    let handler
    const h = {
      response: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis()
    }

    beforeEach(async () => {
      getEntraIdOptions.mockResolvedValue({})
      await entraIdPlugin.plugin.register(server)
      handler = server.route.mock.calls[0][0].options.handler
    })

    it('should return authentication failed message if not authenticated', () => {
      const request = {
        auth: {
          isAuthenticated: false,
          error: { message: 'Some error' }
        }
      }

      const result = handler(request, h)

      expect(result).toBe('Authentication failed: Some error')
    })

    it('should log the underlying error detail when authentication fails', () => {
      const request = {
        auth: {
          isAuthenticated: false,
          error: {
            message: 'Failed obtaining entra-id access token',
            output: { statusCode: 400, payload: { error: 'invalid_client' } }
          }
        }
      }

      handler(request, h)

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.ENTRA_ID_AUTH_FAILURE, {
        errorMessage: 'Failed obtaining entra-id access token',
        statusCode: 400,
        payload: { error: 'invalid_client' }
      })
    })

    it('should return credentials if authenticated', () => {
      const credentials = { name: 'John Doe' }
      const request = {
        auth: {
          isAuthenticated: true,
          credentials
        }
      }

      handler(request, h)

      expect(h.response).toHaveBeenCalledWith(credentials)
      expect(h.type).toHaveBeenCalledWith('application/json')
    })
  })
})
