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

    it('should unwrap the nested Wreck "Response Error" Boom to reach the real Azure error body', () => {
      // This is the actual shape Bell/Wreck produce for any non-2xx token endpoint response:
      // Wreck's `_shortcut` throws its own Boom (`Response Error: <status> <statusText>`) with
      // the real upstream status/body nested at .data.res/.data.payload (an unparsed Buffer);
      // Bell then wraps that again in `Boom.internal('Failed obtaining entra-id access token', err)`.
      const azureErrorBody = Buffer.from(
        JSON.stringify({ error: 'invalid_grant', error_description: 'AADSTS9002313: Invalid request.' }),
        'utf8'
      )
      const wreckResponseError = Object.assign(new Error('Response Error: 400 Bad Request'), {
        isBoom: true,
        data: {
          isResponseError: true,
          res: { statusCode: 400 },
          payload: azureErrorBody
        }
      })
      const request = {
        auth: {
          isAuthenticated: false,
          error: {
            message: 'Failed obtaining entra-id access token',
            output: { statusCode: 500, payload: { statusCode: 500, message: 'An internal server error occurred' } },
            data: wreckResponseError
          }
        }
      }

      handler(request, h)

      expect(log).toHaveBeenCalledWith(LogCodes.AUTH.ENTRA_ID_AUTH_FAILURE, {
        errorMessage: 'Failed obtaining entra-id access token',
        statusCode: 500,
        payload: {
          upstreamStatusCode: 400,
          body: { error: 'invalid_grant', error_description: 'AADSTS9002313: Invalid request.' }
        }
      })
    })

    it('should pass an already-plain-object error body through unchanged', () => {
      const request = {
        auth: {
          isAuthenticated: false,
          error: {
            message: 'Failed obtaining entra-id access token',
            output: { statusCode: 500 },
            data: { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret' }
          }
        }
      }

      handler(request, h)

      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.ENTRA_ID_AUTH_FAILURE,
        expect.objectContaining({
          payload: { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret' }
        })
      )
    })

    it('should decode and parse a raw JSON Buffer response body from the token endpoint', () => {
      const request = {
        auth: {
          isAuthenticated: false,
          error: {
            message: 'Failed obtaining entra-id access token',
            output: { statusCode: 500 },
            data: Buffer.from('{"error":"invalid_grant"}', 'utf8')
          }
        }
      }

      handler(request, h)

      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.ENTRA_ID_AUTH_FAILURE,
        expect.objectContaining({ payload: { error: 'invalid_grant' } })
      )
    })

    it('should fall back to raw text for a non-JSON Buffer response body', () => {
      const request = {
        auth: {
          isAuthenticated: false,
          error: {
            message: 'Failed obtaining entra-id access token',
            output: { statusCode: 500 },
            data: Buffer.from('Bad Gateway', 'utf8')
          }
        }
      }

      handler(request, h)

      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.ENTRA_ID_AUTH_FAILURE,
        expect.objectContaining({ payload: 'Bad Gateway' })
      )
    })

    it('should surface message/code from a raw network exception', () => {
      const networkError = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })
      const request = {
        auth: {
          isAuthenticated: false,
          error: {
            message: 'Failed obtaining entra-id access token',
            output: { statusCode: 500 },
            data: networkError
          }
        }
      }

      handler(request, h)

      expect(log).toHaveBeenCalledWith(
        LogCodes.AUTH.ENTRA_ID_AUTH_FAILURE,
        expect.objectContaining({ payload: { message: 'connect ETIMEDOUT', code: 'ETIMEDOUT' } })
      )
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
