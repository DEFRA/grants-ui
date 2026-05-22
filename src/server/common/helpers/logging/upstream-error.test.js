import { logUpstreamError } from './upstream-error.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

describe('logUpstreamError', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    {
      name: 'endpoint, service, upstreamStatus and errorMessage',
      input: {
        endpoint: '/api/v2/parcels',
        service: 'grants-ui-backend',
        upstreamStatus: 502,
        errorMessage: 'Bad Gateway'
      },
      expected: {
        endpoint: '/api/v2/parcels',
        service: 'grants-ui-backend',
        upstreamStatus: 502,
        errorMessage: 'Bad Gateway'
      }
    },
    {
      name: 'attempts when provided',
      input: {
        endpoint: '/api/v2/parcels',
        service: 'grants-ui-backend',
        upstreamStatus: 503,
        errorMessage: 'Service Unavailable',
        attempts: 3
      },
      expected: {
        endpoint: '/api/v2/parcels',
        service: 'grants-ui-backend',
        upstreamStatus: 503,
        attempts: 3,
        errorMessage: 'Service Unavailable'
      }
    },
    {
      name: 'null upstreamStatus when none was received',
      input: {
        endpoint: '/api/v2/parcels',
        service: 'grants-ui-backend',
        upstreamStatus: undefined,
        errorMessage: 'Network down'
      },
      expected: {
        endpoint: '/api/v2/parcels',
        service: 'grants-ui-backend',
        upstreamStatus: null,
        errorMessage: 'Network down'
      }
    }
  ])('logs EXTERNAL_API_ERROR with $name', ({ input, expected }) => {
    logUpstreamError(input)

    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.EXTERNAL_API_ERROR, expected, undefined)
  })

  it('forwards the Hapi request when supplied', () => {
    const request = { logger: { error: vi.fn() } }

    logUpstreamError(
      {
        endpoint: 'agreements',
        service: 'farming-grants-agreements-ui',
        upstreamStatus: 502,
        errorMessage: 'Bad Gateway'
      },
      request
    )

    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.EXTERNAL_API_ERROR, expect.any(Object), request)
  })
})
