import { describe, test, beforeEach, expect, vi } from 'vitest'
import { auditPublisher } from './audit.js'

vi.mock('@aws-sdk/client-sns', () => ({ SNSClient: vi.fn() }))
vi.mock('@defra/fcp-audit-publisher', () => ({ publishAuditEvent: vi.fn() }))
vi.mock('~/src/config/config.js', () => ({ config: { get: vi.fn() } }))
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    AUDIT: {
      EVENT_PUBLISHED: { level: 'info', messageFunc: vi.fn() },
      EVENT_PUBLISH_FAILED: { level: 'error', messageFunc: vi.fn() }
    }
  }
}))
vi.mock('./audit-event.js', () => ({
  buildAuditEvent: vi.fn(() => ({ mock: 'event' })),
  mapEnvironment: vi.fn(() => 'cdp-test')
}))

const DEFAULT_CONFIG = {
  'audit.enabled': true,
  'aws.endpointUrl': null,
  'aws.region': 'eu-west-2',
  'audit.snsTopicArn': 'arn:aws:sns:eu-west-2:000000000000:fcp_audit_events',
  'audit.application': 'Grants',
  gitRepositoryName: 'grants-ui',
  cdpEnvironment: 'test'
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

const successRequest = (overrides = {}) => ({
  method: 'get',
  auth: { isAuthenticated: true },
  params: { slug: 'my-grant' },
  path: '/my-grant/start',
  app: { model: { def: { startPage: '/start' } } },
  response: { statusCode: 200 },
  sendAuditEvent: vi.fn(),
  ...overrides
})

describe('audit-publisher plugin', () => {
  let config
  let log
  let LogCodes
  let SNSClient
  let publishAuditEvent
  let buildAuditEvent
  let server

  const setupConfig = (overrides = {}) => {
    const merged = { ...DEFAULT_CONFIG, ...overrides }
    config.get.mockImplementation((key) => merged[key])
  }

  // Pulls the function registered via server.decorate('request', 'sendAuditEvent', fn).
  const getDecoratedSend = () => server.decorate.mock.calls.find((c) => c[1] === 'sendAuditEvent')[2]

  beforeEach(async () => {
    vi.clearAllMocks()
    ;({ config } = await import('~/src/config/config.js'))
    ;({ log, LogCodes } = await import('~/src/server/common/helpers/logging/log.js'))
    ;({ SNSClient } = await import('@aws-sdk/client-sns'))
    ;({ publishAuditEvent } = await import('@defra/fcp-audit-publisher'))
    ;({ buildAuditEvent } = await import('./audit-event.js'))
    server = { ext: vi.fn(), decorate: vi.fn() }
  })

  test('has the expected plugin name', () => {
    expect(auditPublisher.plugin.name).toBe('audit-publisher')
  })

  describe('registration gating', () => {
    test('decorates a no-op sendAuditEvent and does nothing else when audit is disabled', async () => {
      setupConfig({ 'audit.enabled': false })

      auditPublisher.plugin.register(server)

      expect(server.ext).not.toHaveBeenCalled()
      expect(SNSClient).not.toHaveBeenCalled()
      expect(server.decorate).toHaveBeenCalledWith('request', 'sendAuditEvent', expect.any(Function))

      // The no-op resolves and never publishes.
      await expect(getDecoratedSend()({ action: 'start' })).resolves.toBeUndefined()
      expect(publishAuditEvent).not.toHaveBeenCalled()
    })

    test('decorates sendAuditEvent and registers an onPreResponse extension when enabled', () => {
      setupConfig()

      auditPublisher.plugin.register(server)

      expect(server.decorate).toHaveBeenCalledWith('request', 'sendAuditEvent', expect.any(Function))
      expect(server.ext).toHaveBeenCalledWith('onPreResponse', expect.any(Function))
    })

    test('builds the SNS client with region only when no endpoint is configured', () => {
      setupConfig()

      auditPublisher.plugin.register(server)

      expect(SNSClient).toHaveBeenCalledWith({ region: 'eu-west-2' })
    })

    test('builds the SNS client with a custom endpoint when configured', () => {
      setupConfig({ 'aws.endpointUrl': 'http://localstack:4566' })

      auditPublisher.plugin.register(server)

      expect(SNSClient).toHaveBeenCalledWith({ region: 'eu-west-2', endpoint: 'http://localstack:4566' })
    })
  })

  describe('request.sendAuditEvent decoration', () => {
    let send
    const request = { params: { slug: 'my-grant' } }

    beforeEach(() => {
      setupConfig()
      auditPublisher.plugin.register(server)
      // server.decorate registers `function (opts) { return send(this, opts) }`,
      // so bind `this` to the request when invoking it.
      const decorated = getDecoratedSend()
      send = (opts) => decorated.call(request, opts)
    })

    test('builds the event, publishes it with the publisher config, and logs success', async () => {
      publishAuditEvent.mockResolvedValue({ messageId: 'mid-1' })

      await send({ action: 'start' })

      expect(buildAuditEvent).toHaveBeenCalledWith(request, { action: 'start' })
      expect(publishAuditEvent).toHaveBeenCalledWith(
        { mock: 'event' },
        expect.objectContaining({
          snsClient: expect.anything(),
          sns: { topicArn: 'arn:aws:sns:eu-west-2:000000000000:fcp_audit_events' },
          application: 'Grants',
          component: 'grants-ui',
          environment: 'cdp-test',
          generateCorrelationId: true
        })
      )
      expect(publishAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ version: expect.anything() })
      )
      expect(log).toHaveBeenCalledWith(
        LogCodes.AUDIT.EVENT_PUBLISHED,
        { messageId: 'mid-1', entity: 'application', action: 'start', entityid: 'my-grant' },
        request
      )
    })

    test('defaults entity to "application" and entityid to the slug, but honours overrides', async () => {
      publishAuditEvent.mockResolvedValue({ messageId: 'mid-2' })

      await send({ action: 'submit', entity: 'page', entityid: 'ref-9' })

      expect(log).toHaveBeenCalledWith(
        LogCodes.AUDIT.EVENT_PUBLISHED,
        { messageId: 'mid-2', entity: 'page', action: 'submit', entityid: 'ref-9' },
        request
      )
    })

    test('logs a failure (without throwing) when publishing rejects', async () => {
      publishAuditEvent.mockRejectedValue(new Error('boom'))

      await expect(send({ action: 'start' })).resolves.toBeUndefined()

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' }),
        { entityid: 'my-grant', action: 'start', errorMessage: 'boom' },
        request
      )
    })
  })

  describe('onPreResponse handler', () => {
    let handler
    const h = { continue: Symbol('continue') }

    beforeEach(() => {
      setupConfig()
      auditPublisher.plugin.register(server)
      handler = server.ext.mock.calls[0][1]
    })

    test('sends a "start" event for an authenticated 2xx grant GET', async () => {
      const request = successRequest()

      const result = handler(request, h)
      expect(result).toBe(h.continue)

      await flushPromises()

      expect(request.sendAuditEvent).toHaveBeenCalledWith({ action: 'start' })
    })

    test('sends a "start" event for a form whose start page is not /start', () => {
      const request = successRequest({
        path: '/my-grant/check-details',
        app: { model: { def: { startPage: '/check-details' } } }
      })

      handler(request, h)

      expect(request.sendAuditEvent).toHaveBeenCalledTimes(1)
    })

    test.each([
      ['method is not GET', { method: 'post' }],
      ['request is unauthenticated', { auth: { isAuthenticated: false } }],
      ['there is no slug', { params: {} }],
      ['the response is a redirect', { response: { statusCode: 302 } }],
      ['the response is an error', { response: new Error('boom') }],
      ['there is no response', { response: undefined }],
      ['the page is not the start page', { path: '/my-grant/some-question' }],
      ['the form model is not loaded', { app: {} }]
    ])('does not send an event when %s', (_label, overrides) => {
      const request = successRequest(overrides)

      const result = handler(request, h)

      expect(request.sendAuditEvent).not.toHaveBeenCalled()
      expect(result).toBe(h.continue)
    })
  })
})
