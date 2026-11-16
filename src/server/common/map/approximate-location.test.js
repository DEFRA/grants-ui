import Hapi from '@hapi/hapi'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { logHandledError } from '~/src/server/common/helpers/logging/handled-error.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { approximateLocationRoute } from './approximate-location.js'
import { ROUTES } from './map-routes.js'

vi.mock('~/src/config/config.js', () => ({ config: { get: vi.fn() } }))
vi.mock('~/src/server/common/helpers/logging/handled-error.js', () => ({ logHandledError: vi.fn() }))

const ENTRY = { POSTCODE_DISTRICT: 'LS8', POPULATED_PLACE: 'Leeds', COUNTRY: 'England' }
const ENDPOINT = 'https://api.os.uk/search/names/v1/nearest'
const QUERY = '?easting=432100&northing=436500'
const response = (data) => ({ ok: true, status: 200, json: vi.fn().mockResolvedValue(data) })

describe('approximate location API', () => {
  let server

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(config.get).mockReturnValue('test-os-names-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ results: [{ GAZETTEER_ENTRY: ENTRY }] })))
    server = Hapi.server()
    server.route(approximateLocationRoute)
  })

  afterEach(async () => {
    await server.stop()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('returns an approximate label without requiring sign-in or exposing credentials', async () => {
    const result = await server.inject(`${ROUTES.approximateLocation}${QUERY}`)
    expect(result.statusCode).toBe(200)
    expect(result.result).toEqual({ label: 'LS8, Leeds' })
    expect(result.headers['cache-control']).toBe('no-store')
    expect(result.payload).not.toContain('test-os-names-key')
    const [url, options] = vi.mocked(fetch).mock.calls[0]
    expect(url.origin + url.pathname).toBe(ENDPOINT)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      point: '432100,436500',
      radius: '1000',
      key: 'test-os-names-key'
    })
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(config.get).toHaveBeenCalledWith('maps.forms.apiKey')
    expect(logHandledError).not.toHaveBeenCalled()
  })

  test.each([
    [{ LOCAL_TYPE: 'Postcode', NAME1: 'LS8 1AA', POPULATED_PLACE: 'Leeds', COUNTRY: 'England' }, 'LS8, Leeds'],
    [{ LOCAL_TYPE: 'Postcode', NAME1: 'sw1a1aa', COUNTRY: 'England' }, 'SW1A'],
    [{ DISTRICT_BOROUGH: 'Leeds', COUNTRY: 'England' }, 'Leeds'],
    [{ COUNTY_UNITARY: 'Highland', COUNTRY: 'Scotland' }, 'Highland'],
    [{ POSTCODE_DISTRICT: 'LS8', POPULATED_PLACE: ' Leeds ', COUNTRY: 'England' }, 'LS8, Leeds'],
    [{ POSTCODE_DISTRICT: 'Leeds', POPULATED_PLACE: 'Leeds', COUNTRY: 'England' }, 'Leeds'],
    [{ COUNTRY: 'England' }, null],
    [{ NAME1: 'A nearby road' }, null],
    [{ POSTCODE_DISTRICT: 123, POPULATED_PLACE: '', COUNTRY: null }, null]
  ])('formats available context and omits missing values (%j)', async (entry, label) => {
    vi.mocked(fetch).mockResolvedValue(response({ results: [{ GAZETTEER_ENTRY: entry }] }))
    const result = await server.inject(`${ROUTES.approximateLocation}${QUERY}`)
    expect(result.statusCode).toBe(200)
    expect(result.result).toEqual({ label })
  })

  test.each([{ results: [] }, { header: { totalresults: 0 } }])(
    'returns no label for an unmatched point (%j)',
    async (data) => {
      vi.mocked(fetch).mockResolvedValue(response(data))
      const result = await server.inject(`${ROUTES.approximateLocation}${QUERY}`)
      expect(result.statusCode).toBe(200)
      expect(result.result).toEqual({ label: null })
      expect(logHandledError).not.toHaveBeenCalled()
    }
  )

  test.each([
    '',
    '?easting=1',
    '?northing=1',
    '?easting=&northing=1',
    '?easting=NaN&northing=1',
    '?easting=Infinity&northing=1',
    '?easting=-1&northing=1',
    '?easting=700001&northing=1',
    '?easting=1&northing=1300001',
    '?easting=1&northing=-1',
    '?easting=1.5&northing=1',
    '?easting=1&northing=1.5',
    '?easting=1&northing=1&url=https://example.com'
  ])('rejects invalid coordinate queries before calling OS (%s)', async (query) => {
    const result = await server.inject(`${ROUTES.approximateLocation}${query}`)
    expect(result.statusCode).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  test.each(['?easting=0&northing=0', '?easting=700000&northing=1300000'])(
    'accepts inclusive National Grid bounds (%s)',
    async (query) => {
      const result = await server.inject(`${ROUTES.approximateLocation}${query}`)
      expect(result.statusCode).toBe(200)
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  )

  test('returns an unavailable response without calling OS when credentials are missing', async () => {
    vi.mocked(config.get).mockReturnValue('')
    const result = await server.inject(`${ROUTES.approximateLocation}${QUERY}`)
    expect(result.statusCode).toBe(503)
    expect(result.result).toEqual({ label: null })
    expect(fetch).not.toHaveBeenCalled()
  })

  test.each(['network', 'http', 'json', 'timeout'])(
    'logs a %s failure once and returns a generic unavailable response',
    async (failure) => {
      const error = new Error('Lookup failed')
      if (failure === 'network' || failure === 'timeout') {
        vi.mocked(fetch).mockRejectedValue(error)
      } else if (failure === 'http') {
        vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 })
      } else {
        vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockRejectedValue(error) })
      }
      const result = await server.inject(`${ROUTES.approximateLocation}${QUERY}`)
      expect(result.statusCode).toBe(503)
      expect(result.result).toEqual({ label: null })
      expect(result.headers['cache-control']).toBe('no-store')
      expect(logHandledError).toHaveBeenCalledExactlyOnceWith(expect.any(Error), expect.any(Object), {
        fallbackCode: LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        fallbackDetails: {
          endpoint: ENDPOINT,
          service: 'os-names',
          upstreamStatus: failure === 'http' ? 429 : failure === 'json' ? 200 : null
        }
      })
      if (failure !== 'http') {
        expect(vi.mocked(logHandledError).mock.calls[0][0]).toBe(error)
      }
    }
  )

  test('bounds the upstream request with a two second timeout', async () => {
    const signal = new AbortController().signal
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
    await server.inject(`${ROUTES.approximateLocation}${QUERY}`)
    expect(timeout).toHaveBeenCalledWith(2000)
    expect(fetch).toHaveBeenCalledWith(expect.any(URL), { signal })
  })
})
