import { vi } from 'vitest'
import { StorageResolution, Unit } from 'aws-embedded-metrics'

import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { runWithRequest } from '~/src/server/common/helpers/request-context.js'
import {
  NON_SCHEME_SPECIFIC,
  OutboundMetricName,
  OutboundService,
  toSchemeDimension,
  withOutboundMetrics
} from '~/src/server/common/helpers/outbound-call-metrics.js'

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

const descriptor = { service: OutboundService.GAS, operation: 'getApplicationStatus' }

/** Lets the fire-and-forget emission settle. */
const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

/** @param {string} name */
const putCallFor = (name) => mockPutMetric.mock.calls.find(([metricName]) => metricName === name)

describe('withOutboundMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFlush.mockResolvedValue(undefined)
    config.set('isMetricsEnabled', true)
  })

  afterAll(() => {
    config.set('isMetricsEnabled', false)
  })

  test('returns the call result and emits count, duration and failure metrics', async () => {
    const response = { status: 200 }

    await expect(withOutboundMetrics({ ...descriptor, scheme: 'farm-payments' }, async () => response)).resolves.toBe(
      response
    )
    await flushPromises()

    expect(mockSetDimensions).toHaveBeenLastCalledWith([
      { Service: 'gas' },
      { Service: 'gas', Scheme: 'farm-payments' },
      { Service: 'gas', Operation: 'getApplicationStatus', Scheme: 'farm-payments' }
    ])
    expect(mockPutMetric).toHaveBeenCalledWith(OutboundMetricName.COUNT, 1, Unit.Count, StorageResolution.Standard)
    expect(mockPutMetric).toHaveBeenCalledWith(OutboundMetricName.FAILURE, 0, Unit.Count, StorageResolution.Standard)
    expect(putCallFor(OutboundMetricName.DURATION)).toEqual([
      OutboundMetricName.DURATION,
      expect.any(Number),
      Unit.Milliseconds,
      StorageResolution.Standard
    ])
    expect(mockFlush).toHaveBeenCalledTimes(1)
  })

  test('records a failure and rethrows when the call throws', async () => {
    const error = new Error('connection refused')

    await expect(withOutboundMetrics(descriptor, () => Promise.reject(error))).rejects.toBe(error)
    await flushPromises()

    expect(putCallFor(OutboundMetricName.FAILURE)?.[1]).toBe(1)
    expect(putCallFor(OutboundMetricName.COUNT)?.[1]).toBe(1)
  })

  test.each([
    [500, 1],
    [503, 1],
    [429, 1],
    [404, 0],
    [400, 0],
    [204, 0]
  ])('classifies an HTTP %i response as failure=%i', async (status, expected) => {
    await withOutboundMetrics(descriptor, async () => ({ status }))
    await flushPromises()

    expect(putCallFor(OutboundMetricName.FAILURE)?.[1]).toBe(expected)
  })

  test('uses a custom isFailure classifier when supplied', async () => {
    await withOutboundMetrics({ ...descriptor, isFailure: (result) => result === 'bad' }, async () => 'bad')
    await flushPromises()

    expect(putCallFor(OutboundMetricName.FAILURE)?.[1]).toBe(1)
  })

  test('defaults the scheme to the slug of the current request', async () => {
    await runWithRequest(/** @type {any} */ ({ params: { slug: 'woodland' } }), () =>
      withOutboundMetrics(descriptor, async () => ({ status: 200 }))
    )
    await flushPromises()

    expect(mockSetDimensions).toHaveBeenLastCalledWith(
      expect.arrayContaining([{ Service: 'gas', Operation: 'getApplicationStatus', Scheme: 'woodland' }])
    )
  })

  test('prefers an explicit scheme over the request slug', async () => {
    await runWithRequest(/** @type {any} */ ({ params: { slug: 'woodland' } }), () =>
      withOutboundMetrics({ ...descriptor, scheme: NON_SCHEME_SPECIFIC }, async () => ({ status: 200 }))
    )
    await flushPromises()

    expect(mockSetDimensions).toHaveBeenLastCalledWith(
      expect.arrayContaining([{ Service: 'gas', Scheme: NON_SCHEME_SPECIFIC }])
    )
  })

  test('uses the non-scheme-specific placeholder outside a request', async () => {
    await withOutboundMetrics(descriptor, async () => ({ status: 200 }))
    await flushPromises()

    expect(mockSetDimensions).toHaveBeenLastCalledWith(
      expect.arrayContaining([{ Service: 'gas', Scheme: NON_SCHEME_SPECIFIC }])
    )
  })

  test('logs, but does not fail the call, when metrics cannot be flushed', async () => {
    mockFlush.mockRejectedValue(new Error('flush failed'))

    await expect(withOutboundMetrics(descriptor, async () => 'ok')).resolves.toBe('ok')
    await flushPromises()

    expect(log).toHaveBeenCalledWith(LogCodes.SYSTEM.METRICS_EMIT_FAILED, {
      service: 'gas',
      operation: 'getApplicationStatus',
      errorMessage: 'flush failed'
    })
  })

  test('logs, but does not fail the call, when the failure classifier throws', async () => {
    const isFailure = () => {
      throw new Error('bad classifier')
    }

    await expect(withOutboundMetrics({ ...descriptor, isFailure }, async () => 'ok')).resolves.toBe('ok')
    await flushPromises()

    expect(log).toHaveBeenCalledWith(
      LogCodes.SYSTEM.METRICS_EMIT_FAILED,
      expect.objectContaining({ errorMessage: 'bad classifier' })
    )
  })

  test('passes straight through without emitting when metrics are disabled', async () => {
    config.set('isMetricsEnabled', false)

    await expect(withOutboundMetrics(descriptor, async () => 'ok')).resolves.toBe('ok')
    await flushPromises()

    expect(mockPutMetric).not.toHaveBeenCalled()
    expect(mockFlush).not.toHaveBeenCalled()
  })
})

describe('toSchemeDimension', () => {
  test.each([
    ['farm-payments', 'farm-payments'],
    ['example-grant-with-auth', 'example-grant-with-auth'],
    [undefined, NON_SCHEME_SPECIFIC],
    ['', NON_SCHEME_SPECIFIC],
    ['Not A Slug', NON_SCHEME_SPECIFIC],
    ['../etc/passwd', NON_SCHEME_SPECIFIC],
    ['a'.repeat(65), NON_SCHEME_SPECIFIC],
    [42, NON_SCHEME_SPECIFIC]
  ])('maps %j to %j', (input, expected) => {
    expect(toSchemeDimension(input)).toBe(expected)
  })
})
