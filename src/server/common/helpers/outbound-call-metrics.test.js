import http from 'node:http'
import net from 'node:net'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'
import { getGlobalDispatcher, ProxyAgent, setGlobalDispatcher } from 'undici'

import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { runWithRequest } from '~/src/server/common/helpers/request-context.js'
import {
  installOutboundCallMetrics,
  NON_SCHEME_SPECIFIC,
  OutboundMetricName,
  toSchemeDimension,
  uninstallOutboundCallMetrics
} from '~/src/server/common/helpers/outbound-call-metrics.js'

// The global test setup mocks Wreck; these tests need the real client making real requests.
const { default: Wreck } = await vi.importActual('@hapi/wreck')

const { mockPutMetric, mockFlush, mockSetDimensions } = vi.hoisted(() => ({
  mockPutMetric: vi.fn(),
  mockFlush: vi.fn(),
  mockSetDimensions: vi.fn()
}))

vi.mock('@defra/cdp-metrics', () => ({
  Metrics: class {
    getMetricsLogger() {
      return { putMetric: mockPutMetric, flush: mockFlush, setDimensions: mockSetDimensions }
    }
  }
}))

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

const HOST = '127.0.0.1'
const CONFIGURED = {
  'gas.apiEndpoint': '/gas',
  'landGrants.grantsServiceApiEndpoint': '/land-grants',
  'defraId.wellKnownUrl': '/idp/.well-known/openid-configuration'
}

/** @type {http.Server} */
let server
let baseUrl = ''
/** @type {Record<string, unknown>} */
const previousConfig = {}

/** @param {http.Server} target */
const listen = (target) =>
  new Promise((resolve) => target.listen(0, HOST, () => resolve(/** @type {any} */ (target.address()).port)))

/** Lets the fire-and-forget emission settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

/** @returns {Array<Record<string, string>>} The most specific dimension set of each emitted data point */
const emitted = () => mockSetDimensions.mock.calls.map(([sets]) => sets.at(-1))

/** @param {string} name */
const valuesOf = (name) => mockPutMetric.mock.calls.filter(([metric]) => metric === name).map(([, value]) => value)

/**
 * @param {string} slug
 * @param {() => Promise<unknown>} fn
 */
const inJourney = (slug, fn) => runWithRequest(/** @type {any} */ ({ params: { slug } }), fn)

const closedPort = () =>
  new Promise((resolve) => {
    const probe = net.createServer().listen(0, HOST, () => {
      const { port } = /** @type {any} */ (probe.address())
      probe.close(() => resolve(port))
    })
  })

beforeAll(async () => {
  server = http.createServer((req, res) => {
    // e.g. `/status-503/...` responds 503. A path, not a query, so it survives clients that rebuild URLs.
    const status = Number(/\/status-(\d{3})/.exec(req.url ?? '')?.[1] ?? 200)
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end('{}')
  })
  baseUrl = `http://${HOST}:${await listen(server)}`
  for (const [setting, path] of Object.entries(CONFIGURED)) {
    previousConfig[setting] = config.get(/** @type {any} */ (setting))
    config.set(/** @type {any} */ (setting), `${baseUrl}${path}`)
  }
})

afterAll(async () => {
  for (const [setting, value] of Object.entries(previousConfig)) {
    config.set(/** @type {any} */ (setting), value)
  }
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  vi.clearAllMocks()
  mockFlush.mockResolvedValue(undefined)
  config.set('isMetricsEnabled', true)
  installOutboundCallMetrics()
})

afterEach(() => {
  uninstallOutboundCallMetrics()
  config.set('isMetricsEnabled', false)
})

describe('outbound call metrics', () => {
  describe('fetch', () => {
    test('records count, duration and success, attributed to the configured dependency and scheme', async () => {
      const response = await inJourney('woodland', () => fetch(`${baseUrl}/gas/grants/woodland/applications`))
      await settle()

      expect(/** @type {Response} */ (response).status).toBe(200)
      expect(mockSetDimensions).toHaveBeenCalledWith([
        { Service: 'gas' },
        { Service: 'gas', Scheme: 'woodland' },
        { Service: 'gas', Method: 'GET', Scheme: 'woodland' }
      ])
      expect(valuesOf(OutboundMetricName.COUNT)).toEqual([1])
      expect(valuesOf(OutboundMetricName.FAILURE)).toEqual([0])
      expect(valuesOf(OutboundMetricName.DURATION)).toEqual([expect.any(Number)])
    })

    test('picks the dependency by base path when several share a host', async () => {
      await fetch(`${baseUrl}/land-grants/api/v2/parcels`, { method: 'post', body: '{}' })
      await settle()

      expect(emitted()).toEqual([{ Service: 'land-grants-api', Method: 'POST', Scheme: NON_SCHEME_SPECIFIC }])
    })

    test.each([
      [503, 1],
      [429, 1],
      [404, 0]
    ])('classifies HTTP %i as failure=%i', async (status, failure) => {
      await fetch(`${baseUrl}/status-${status}/x`)
      await settle()

      expect(valuesOf(OutboundMetricName.FAILURE)).toEqual([failure])
    })

    test('records a failure when the connection is refused', async () => {
      await expect(fetch(`http://${HOST}:${await closedPort()}/x`)).rejects.toThrow()
      await settle()

      expect(valuesOf(OutboundMetricName.FAILURE)).toEqual([1])
    })

    test('records a failure when the call times out', async () => {
      const slow = http.createServer((_req, res) => setTimeout(() => res.end(), 500))
      const port = await listen(slow)

      await expect(fetch(`http://${HOST}:${port}/slow`, { signal: AbortSignal.timeout(20) })).rejects.toThrow()
      await settle()
      slow.closeAllConnections()
      slow.close()

      expect(valuesOf(OutboundMetricName.FAILURE)).toEqual([1])
    })

    test('reports the target, not the proxy, when sent through the egress proxy', async () => {
      const previousDispatcher = getGlobalDispatcher()
      setGlobalDispatcher(new ProxyAgent(baseUrl))

      await inJourney('woodland', () => fetch('http://gas.example.internal/grants/x/applications'))
      await settle()
      setGlobalDispatcher(previousDispatcher)

      expect(emitted()).toEqual([{ Service: 'gas.example.internal', Method: 'GET', Scheme: 'woodland' }])
    })
  })

  describe('node:http clients', () => {
    test('records Wreck calls, and treats Defra ID as non-scheme-specific', async () => {
      await inJourney('farm-payments', () => Wreck.get(`${baseUrl}/idp/jwks`))
      await settle()

      expect(emitted()).toEqual([{ Service: 'defra-id', Method: 'GET', Scheme: NON_SCHEME_SPECIFIC }])
    })

    test('reports an unconfigured host by its hostname', async () => {
      await inJourney('farm-payments', () => Wreck.get(`http://localhost:${new URL(baseUrl).port}/other`))
      await settle()

      expect(emitted()).toEqual([{ Service: 'localhost', Method: 'GET', Scheme: 'farm-payments' }])
    })

    test('records a failed Wreck call', async () => {
      await expect(Wreck.get(`http://${HOST}:${await closedPort()}/x`)).rejects.toThrow()
      await settle()

      expect(valuesOf(OutboundMetricName.FAILURE)).toEqual([1])
    })

    test('counts every AWS SDK retry attempt', async () => {
      const snsClient = new SNSClient({
        endpoint: `${baseUrl}/status-503/`,
        region: 'eu-west-2',
        maxAttempts: 3,
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
      })

      await expect(
        snsClient.send(new PublishCommand({ TopicArn: 'arn:aws:sns:eu-west-2:000000000000:t', Message: '{}' }))
      ).rejects.toThrow()
      await settle()

      expect(valuesOf(OutboundMetricName.COUNT)).toEqual([1, 1, 1])
      expect(valuesOf(OutboundMetricName.FAILURE)).toEqual([1, 1, 1])
    })
  })

  test('does not record anything once uninstalled', async () => {
    uninstallOutboundCallMetrics()

    await fetch(`${baseUrl}/x`)
    await Wreck.get(`${baseUrl}/x`)
    await settle()

    expect(mockPutMetric).not.toHaveBeenCalled()
  })

  test('does not install when metrics are disabled', async () => {
    uninstallOutboundCallMetrics()
    config.set('isMetricsEnabled', false)
    installOutboundCallMetrics()

    await fetch(`${baseUrl}/x`)
    await settle()

    expect(mockPutMetric).not.toHaveBeenCalled()
  })

  test('logs, but does not fail the call, when metrics cannot be flushed', async () => {
    mockFlush.mockRejectedValue(new Error('flush failed'))

    const response = await fetch(`${baseUrl}/gas/x`)
    await settle()

    expect(response.status).toBe(200)
    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.METRICS_EMIT_FAILED, {
      service: 'gas',
      method: 'GET',
      errorMessage: 'flush failed'
    })
  })

  test('does not measure HTTP calls made while sending metrics', async () => {
    mockFlush.mockImplementation(() => fetch(`${baseUrl}/emf-agent`).then(() => undefined))

    await fetch(`${baseUrl}/x`)
    await settle()

    expect(valuesOf(OutboundMetricName.COUNT)).toEqual([1])
  })
})

describe('metrics debug log', () => {
  /** @type {string} */
  let dir
  /** @type {string} */
  let file

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'metrics-debug-'))
    file = path.join(dir, 'nested', 'outbound-metrics.log')
    uninstallOutboundCallMetrics()
  })

  afterEach(() => {
    config.set('metricsDebugLogFile', '')
    rmSync(dir, { recursive: true, force: true })
  })

  test('writes each data point exactly as given to the metrics logger', async () => {
    config.set('metricsDebugLogFile', file)
    installOutboundCallMetrics()

    await inJourney('woodland', () => fetch(`${baseUrl}/gas/x`))
    await fetch(`${baseUrl}/status-503/x`)
    await settle()

    const lines = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      timestamp: expect.any(String),
      dimensions: mockSetDimensions.mock.calls[0][0],
      metrics: [
        { name: OutboundMetricName.COUNT, value: 1, unit: 'Count' },
        { name: OutboundMetricName.DURATION, value: expect.any(Number), unit: 'Milliseconds' },
        { name: OutboundMetricName.FAILURE, value: 0, unit: 'Count' }
      ]
    })
    expect(lines[0].dimensions.at(-1)).toEqual({ Service: 'gas', Method: 'GET', Scheme: 'woodland' })
    expect(lines[1].metrics.at(-1)).toEqual({ name: OutboundMetricName.FAILURE, value: 1, unit: 'Count' })
  })

  test('writes nothing when no file is configured', async () => {
    installOutboundCallMetrics()

    await fetch(`${baseUrl}/x`)
    await settle()

    expect(mockPutMetric).toHaveBeenCalled()
    expect(existsSync(path.dirname(file))).toBe(false)
  })
})

describe('toSchemeDimension', () => {
  test.each([
    ['farm-payments', 'farm-payments'],
    [undefined, NON_SCHEME_SPECIFIC],
    ['Not A Slug', NON_SCHEME_SPECIFIC],
    ['../etc/passwd', NON_SCHEME_SPECIFIC],
    ['a'.repeat(65), NON_SCHEME_SPECIFIC]
  ])('maps %j to %j', (input, expected) => {
    expect(toSchemeDimension(input)).toBe(expected)
  })
})
