import { vi } from 'vitest'
import { mockFetch } from '~/src/__mocks__'
import { catchAll } from '~/src/server/common/helpers/errors.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { LogCodes as ErrorLogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { ConsolidatedViewError } from '~/src/server/common/utils/errors/ConsolidatedViewError.js'
import {
  executeConfigDrivenQuery,
  fetchBusinessAndCPH,
  fetchBusinessAndCustomerInformation,
  fetchBusinessPermissions,
  fetchParcelsFromDal
} from './consolidated-view.service.js'
import { mockRequest, resetConsolidatedViewMocks } from './consolidated-view.service.test-helpers.js'

vi.mock('~/src/server/common/helpers/retry.js')
vi.mock('~/src/server/common/helpers/entra/token-manager.js', () => ({ getValidToken: vi.fn() }))
vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

const mockFetchInstance = mockFetch()
const query = 'query { customer { info { name { first } } } business { info { name } } }'
const callers = [
  ['permissions', fetchBusinessPermissions],
  ['parcels', fetchParcelsFromDal],
  ['business and customer information', fetchBusinessAndCustomerInformation],
  ['business and CPH', fetchBusinessAndCPH],
  ['config-driven queries', (request) => executeConfigDrivenQuery(request, query)]
]

describe('DAL response conventions', () => {
  beforeEach(() => resetConsolidatedViewMocks(mockFetchInstance))

  describe.each(callers)('%s', (_name, fetchData) => {
    it.each([200, 404])(
      'rejects a missing customer or business with HTTP %s and preserves all errors',
      async (status) => {
        const errors = [
          { message: 'Customer not found', path: ['customer'], extensions: { code: 'NOT_FOUND' } },
          { message: 'Business not found', path: ['business'], extensions: { code: 'NOT_FOUND' } }
        ]
        mockFetchInstance.mockResolvedValueOnce(
          new Response(JSON.stringify({ errors, data: { customer: null, business: null } }), { status })
        )

        const error = await fetchData(mockRequest).catch((err) => err)

        expect(error).toBeInstanceOf(ConsolidatedViewError)
        expect(error.details).toEqual(
          expect.objectContaining({
            reason: 'graphql_errors',
            status: 502,
            statusCode: status,
            responseBody: JSON.stringify({ errors })
          })
        )
        expect(error.message).toContain('Customer not found; Business not found')
        expect(log).not.toHaveBeenCalled()

        const request = { ...mockRequest, response: error }
        const h = { view: vi.fn().mockReturnThis(), code: vi.fn().mockReturnThis(), request: { app: {} } }
        catchAll(request, h)

        expect(h.view).toHaveBeenCalledWith('errors/500', { supportEmail: null })
        expect(h.code).toHaveBeenCalledWith(502)
        expect(log).toHaveBeenCalledExactlyOnceWith(
          ErrorLogCodes.SYSTEM.CONSOLIDATED_VIEW_API_ERROR,
          expect.objectContaining({ statusCode: status, responseBody: JSON.stringify({ errors }) }),
          request
        )
      }
    )
  })

  it.each([200, 403, 404])('accepts and logs configured partial failures once with HTTP %s', async (status) => {
    const body = {
      data: { business: { info: { name: 'Test Business' }, countyParishHoldings: null } },
      errors: [{ message: 'Forbidden', path: ['business', 'countyParishHoldings'] }]
    }
    mockFetchInstance.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))

    await expect(
      executeConfigDrivenQuery(mockRequest, query, { toleratedPaths: ['countyParishHoldings'] })
    ).resolves.toEqual(body)
    expect(log).toHaveBeenCalledExactlyOnceWith(
      LogCodes.SYSTEM.CONSOLIDATED_VIEW_PARTIAL_SUCCESS,
      expect.objectContaining({ failedPaths: 'business.countyParishHoldings', statusCode: status }),
      mockRequest
    )
  })

  it('formats a tolerated null CPH result without discarding the available business data', async () => {
    const body = {
      data: { business: { info: { name: 'Test Business' }, countyParishHoldings: null } },
      errors: [{ message: 'Forbidden', path: ['business', 'countyParishHoldings'] }]
    }
    mockFetchInstance.mockResolvedValueOnce(new Response(JSON.stringify(body)))

    await expect(fetchBusinessAndCPH(mockRequest, { toleratedPaths: ['countyParishHoldings'] })).resolves.toEqual({
      business: body.data.business.info,
      countyParishHoldings: undefined,
      customer: undefined
    })
  })

  it.each([200, 404])('rejects mixed tolerated and non-tolerated errors with HTTP %s', async (status) => {
    const body = {
      data: { business: { info: { name: 'Test Business' } }, customer: null },
      errors: [
        { message: 'Forbidden', path: ['business', 'countyParishHoldings'] },
        { message: 'Customer not found', path: ['customer'] }
      ]
    }
    mockFetchInstance.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))

    await expect(
      executeConfigDrivenQuery(mockRequest, query, { toleratedPaths: ['countyParishHoldings'] })
    ).rejects.toMatchObject({ details: expect.objectContaining({ status: 502, reason: 'graphql_errors' }) })
    expect(log).not.toHaveBeenCalled()
  })

  it.each([undefined, null, {}, { business: null }])(
    'rejects tolerated errors without usable data: %j',
    async (data) => {
      const body = { data, errors: [{ message: 'Forbidden', path: ['business', 'countyParishHoldings'] }] }
      mockFetchInstance.mockResolvedValueOnce(new Response(JSON.stringify(body)))

      await expect(
        executeConfigDrivenQuery(mockRequest, query, { toleratedPaths: ['countyParishHoldings'] })
      ).rejects.toMatchObject({ details: expect.objectContaining({ status: 502, reason: 'graphql_errors' }) })
      expect(log).not.toHaveBeenCalled()
    }
  )

  it.each([null, {}, { data: null }, { data: {} }, { data: { customer: null } }, { data: [] }])(
    'rejects HTTP 200 without usable data: %j',
    async (body) => {
      mockFetchInstance.mockResolvedValueOnce(new Response(JSON.stringify(body)))

      await expect(fetchBusinessPermissions(mockRequest)).rejects.toMatchObject({
        details: expect.objectContaining({ status: 502, statusCode: 200, reason: 'invalid_response' })
      })
    }
  )

  it('rejects malformed JSON and preserves the parsing error', async () => {
    mockFetchInstance.mockResolvedValueOnce(new Response('<html>Upstream error</html>'))

    const error = await fetchBusinessPermissions(mockRequest).catch((err) => err)

    expect(error).toBeInstanceOf(ConsolidatedViewError)
    expect(error.details).toEqual(expect.objectContaining({ status: 502, reason: 'invalid_response' }))
    expect([...error.causeErrors]).toHaveLength(1)
  })

  it.each([{ errors: undefined }, { errors: [] }])('accepts empty result lists with $errors', async ({ errors }) => {
    const body = { data: { customer: { business: { permissionGroups: [] } } }, errors }
    mockFetchInstance.mockResolvedValueOnce(new Response(JSON.stringify(body)))

    await expect(fetchBusinessPermissions(mockRequest)).resolves.toEqual({ role: undefined, permissionGroups: [] })
    expect(log).toHaveBeenCalledExactlyOnceWith(
      LogCodes.SYSTEM.CONSOLIDATED_VIEW_SUCCESS,
      { sbi: mockRequest.auth.credentials.sbi },
      mockRequest
    )
  })

  describe('retry policy', () => {
    const getShouldRetry = () => retry.mock.calls[0][1].shouldRetry

    it.each([
      ['GraphQL errors with HTTP 200', () => new Response(JSON.stringify({ errors: [{ message: 'Not found' }] }))],
      [
        'GraphQL errors with HTTP 404',
        () => new Response(JSON.stringify({ errors: [{ message: 'Not found' }] }), { status: 404 })
      ],
      ['malformed JSON', () => new Response('<html>Upstream error</html>')],
      ['HTTP 200 without usable data', () => new Response(JSON.stringify({ data: null }))]
    ])('does not retry %s', async (_name, createResponse) => {
      mockFetchInstance.mockResolvedValueOnce(createResponse())

      const error = await fetchBusinessPermissions(mockRequest).catch((err) => err)

      expect(error).toBeInstanceOf(ConsolidatedViewError)
      expect(getShouldRetry()(error)).toBe(false)
    })

    it.each([400, 403, 404])('does not retry a GraphQL error with upstream status %s', async (status) => {
      const errors = [{ message: 'Permanent failure', extensions: { http: { status } } }]
      mockFetchInstance.mockResolvedValueOnce(new Response(JSON.stringify({ errors })))

      const error = await fetchBusinessPermissions(mockRequest).catch((err) => err)

      expect(getShouldRetry()(error)).toBe(false)
    })

    it.each([
      [500, undefined],
      [503, undefined],
      [200, 500],
      [200, 503],
      [404, 503]
    ])('retries GraphQL errors with HTTP %s and upstream status %s', async (status, upstreamStatus) => {
      const errors = [{ message: 'Service unavailable', extensions: { http: { status: upstreamStatus } } }]
      mockFetchInstance.mockResolvedValueOnce(new Response(JSON.stringify({ errors }), { status }))

      const error = await fetchBusinessPermissions(mockRequest).catch((err) => err)

      expect(error.details).toEqual(
        expect.objectContaining({ reason: 'graphql_errors', status: 502, statusCode: status })
      )
      expect(getShouldRetry()(error)).toBe(true)
    })

    it.each([401, 500, 503])('retries a non-GraphQL HTTP %s failure', async (status) => {
      mockFetchInstance.mockResolvedValueOnce(new Response('Service unavailable', { status }))

      const error = await fetchBusinessPermissions(mockRequest).catch((err) => err)

      expect(error.details.reason).toBe('api_response_not_ok')
      expect(getShouldRetry()(error)).toBe(true)
    })

    it('retries network failures and timeouts', async () => {
      mockFetchInstance.mockRejectedValueOnce(new Error('fetch failed'))

      const error = await fetchBusinessPermissions(mockRequest).catch((err) => err)

      expect(getShouldRetry()(error)).toBe(true)
      expect(getShouldRetry()(new Error('Operation timed out after 30000ms'))).toBe(true)
    })

    describe('with the real retry helper', () => {
      beforeEach(async () => {
        const { retry: realRetry } = await vi.importActual('~/src/server/common/helpers/retry.js')
        retry.mockImplementationOnce(realRetry)
        vi.useFakeTimers()
      })

      afterEach(() => {
        vi.clearAllTimers()
        vi.useRealTimers()
      })

      it.each([
        [500, undefined],
        [503, undefined],
        [200, 500],
        [200, 503]
      ])('recovers after GraphQL errors with HTTP %s and upstream status %s', async (status, upstreamStatus) => {
        const errors = [{ message: 'Service unavailable', extensions: { http: { status: upstreamStatus } } }]
        const body = { data: { customer: { business: { permissionGroups: [] } } } }
        mockFetchInstance
          .mockResolvedValueOnce(new Response(JSON.stringify({ errors }), { status }))
          .mockResolvedValueOnce(new Response(JSON.stringify(body)))

        const result = fetchBusinessPermissions(mockRequest)
        await vi.runAllTimersAsync()

        await expect(result).resolves.toEqual({ role: undefined, permissionGroups: [] })
        expect(mockFetchInstance).toHaveBeenCalledTimes(2)
        expect(log).toHaveBeenCalledExactlyOnceWith(
          LogCodes.SYSTEM.CONSOLIDATED_VIEW_SUCCESS,
          { sbi: mockRequest.auth.credentials.sbi },
          mockRequest
        )
      })

      it('preserves all GraphQL errors and returns 502 after exhausting retries', async () => {
        const errors = [
          { message: 'Customer not found', extensions: { http: { status: 404 } } },
          { message: 'Business service unavailable', extensions: { http: { status: 503 } } }
        ]
        mockFetchInstance.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ errors }))))

        const result = fetchBusinessPermissions(mockRequest).catch((error) => error)
        await vi.runAllTimersAsync()
        const error = await result

        expect(mockFetchInstance).toHaveBeenCalledTimes(3)
        expect(error).toBeInstanceOf(ConsolidatedViewError)
        expect(error.details).toEqual(
          expect.objectContaining({
            reason: 'graphql_errors',
            status: 502,
            statusCode: 200,
            responseBody: JSON.stringify({ errors })
          })
        )
        expect(log).not.toHaveBeenCalled()

        const request = { ...mockRequest, response: error }
        const h = { view: vi.fn().mockReturnThis(), code: vi.fn().mockReturnThis(), request: { app: {} } }
        catchAll(request, h)

        expect(h.view).toHaveBeenCalledWith('errors/500', { supportEmail: null })
        expect(h.code).toHaveBeenCalledWith(502)
        expect(log).toHaveBeenCalledExactlyOnceWith(
          ErrorLogCodes.SYSTEM.CONSOLIDATED_VIEW_API_ERROR,
          expect.objectContaining({ statusCode: 200, responseBody: JSON.stringify({ errors }) }),
          request
        )
      })

      it('fails permanent GraphQL errors after one attempt', async () => {
        const errors = [{ message: 'Not found', extensions: { http: { status: 404 } } }]
        mockFetchInstance.mockResolvedValueOnce(new Response(JSON.stringify({ errors })))

        const result = fetchBusinessPermissions(mockRequest).catch((error) => error)
        await vi.runAllTimersAsync()

        expect(await result).toBeInstanceOf(ConsolidatedViewError)
        expect(mockFetchInstance).toHaveBeenCalledTimes(1)
      })

      it('accepts tolerated transient failures with usable data after one attempt', async () => {
        const body = {
          data: { business: { info: { name: 'Test Business' }, countyParishHoldings: null } },
          errors: [
            {
              message: 'Service unavailable',
              path: ['business', 'countyParishHoldings'],
              extensions: { http: { status: 503 } }
            }
          ]
        }
        mockFetchInstance.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 503 }))

        const result = executeConfigDrivenQuery(mockRequest, query, { toleratedPaths: ['countyParishHoldings'] })
        await vi.runAllTimersAsync()

        await expect(result).resolves.toEqual(body)
        expect(mockFetchInstance).toHaveBeenCalledTimes(1)
        expect(log).toHaveBeenCalledExactlyOnceWith(
          LogCodes.SYSTEM.CONSOLIDATED_VIEW_PARTIAL_SUCCESS,
          expect.objectContaining({ failedPaths: 'business.countyParishHoldings', statusCode: 503 }),
          mockRequest
        )
      })
    })
  })

  it.each([401, 403, 500])('preserves HTTP %s and a non-GraphQL failure body', async (status) => {
    const body = JSON.stringify({ message: 'Access or service failure' })
    mockFetchInstance.mockResolvedValueOnce(new Response(body, { status }))

    await expect(fetchBusinessPermissions(mockRequest)).rejects.toMatchObject({
      details: expect.objectContaining({
        status,
        statusCode: status,
        responseBody: body,
        reason: 'api_response_not_ok'
      })
    })
  })
})
