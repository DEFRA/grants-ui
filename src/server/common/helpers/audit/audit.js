import { SNSClient } from '@aws-sdk/client-sns'
import { publishAuditEvent } from '@defra/fcp-audit-publisher'
import { getStartPath } from '@defra/forms-engine-plugin/engine/helpers.js'
import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { buildAuditEvent, mapEnvironment } from './audit-event.js'

const HTTP_OK_MIN = 200
const HTTP_REDIRECT_MIN = 300
// The forms engine's `proceed()` redirects a successful page POST to the next
// page with 303 (See Other); GET redirects and submission `h.redirect`s are 302.
// So 303 uniquely identifies a "next page" navigation.
const HTTP_SEE_OTHER = 303

/**
 * True when the request targets the grant's start page (the form's configured
 * entry path), rather than any of the journey's subsequent pages. We compare
 * the request path against the engine's own start path so it stays correct
 * across forms whose start page differs (e.g. `/start` vs `/check-details`) and
 * across the V1/V2 engines. Without the loaded model we can't know the start
 * path, so we don't audit.
 * @param {import('@hapi/hapi').Request} request
 * @returns {boolean}
 */
const isGrantStartPage = (request) => {
  const model = /** @type {{ model?: import('@defra/forms-engine-plugin/engine/models/index.js').FormModel }} */ (
    request.app
  ).model
  if (!model) {
    return false
  }
  return request.path === `/${request.params.slug}${getStartPath(model)}`
}

/**
 * True when the request represents a signed-in user successfully loading a
 * grant's start page: an authenticated GET to the form's start route that
 * returned 2xx. Subsequent journey pages are deliberately not audited.
 * @param {import('@hapi/hapi').Request} request
 * @returns {boolean}
 */
const isSuccessfulGrantAccess = (request) => {
  const { response } = request
  if (!response || response instanceof Error) {
    return false
  }
  return (
    request.method === 'get' &&
    request.auth.isAuthenticated &&
    Boolean(request.params.slug) &&
    response.statusCode >= HTTP_OK_MIN &&
    response.statusCode < HTTP_REDIRECT_MIN &&
    isGrantStartPage(request)
  )
}

/**
 * True when the request is a signed-in user successfully advancing to the next
 * page of a grant journey.
 * @param {import('@hapi/hapi').Request} request
 * @returns {boolean}
 */
const isSuccessfulPageNavigation = (request) => {
  const { response } = request
  if (!response || response instanceof Error) {
    return false
  }
  return (
    request.method === 'post' &&
    request.auth.isAuthenticated &&
    Boolean(request.params.slug) &&
    Boolean(request.params.path) &&
    response.statusCode === HTTP_SEE_OTHER
  )
}

/**
 * Returns the submitted answers for a page, with the engine's form-control
 * fields (`crumb` CSRF token and `action` button value) removed, leaving the
 * exact question/answer block the user submitted on that view.
 * @param {unknown} payload
 * @returns {unknown}
 */
const answersFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return payload
  }
  const { crumb, action, ...answers } = /** @type {Record<string, unknown>} */ (payload)
  return answers
}

/**
 * Builds the request-bound publish function. It constructs the FCP Audit event
 * from the given options, publishes it, and centralises success/failure logging
 * so every call site behaves consistently. Failures are logged, never thrown:
 * auditing is best-effort and must not break the request it describes.
 * @param {Parameters<typeof publishAuditEvent>[1]} publisherConfig - Config passed to `publishAuditEvent`.
 * @returns {(request: import('@hapi/hapi').Request, opts: import('./audit-event.js').AuditEventOptions) => Promise<void>}
 */
const makeSendAuditEvent = (publisherConfig) => (request, opts) => {
  const entity = opts.entity ?? 'application'
  const entityid = opts.entityid ?? request.params.slug
  const event = buildAuditEvent(request, opts)

  return publishAuditEvent(event, publisherConfig)
    .then(({ messageId }) =>
      log(LogCodes.AUDIT.EVENT_PUBLISHED, { messageId, entity, action: opts.action, entityid }, request)
    )
    .catch((err) =>
      log(
        { ...LogCodes.AUDIT.EVENT_PUBLISH_FAILED, error: /** @type {Error} */ (err) },
        { entityid, action: opts.action, errorMessage: /** @type {Error} */ (err).message },
        request
      )
    )
}

/**
 * Hapi plugin that wires FCP Audit publishing. It decorates every request with
 * two entry points so any call site can publish an event:
 * - `sendAuditEvent(opts)` returns the publish Promise (await it where the
 *   handler is async and wants the event delivered before responding).
 * - `sendAuditEventInBackground(opts)` is fire-and-forget: it returns `void`,
 *   never throws, and leaves no floating promise (for sync handlers and hooks).
 * Keeps the existing behaviour of auditing a signed-in user starting a grant.
 * Gated behind `audit.enabled`; when disabled both decorations are no-ops so
 * call sites stay unconditional.
 * @satisfies {import('@hapi/hapi').ServerRegisterPluginObject<void>}
 */
export const auditPublisher = {
  plugin: {
    name: 'audit-publisher',
    register(server) {
      if (!config.get('audit.enabled')) {
        server.decorate('request', 'sendAuditEvent', async () => {})
        server.decorate('request', 'sendAuditEventInBackground', () => {})
        return
      }

      const endpoint = config.get('aws.endpointUrl')
      const snsClient = new SNSClient({
        region: config.get('aws.region'),
        ...(endpoint && { endpoint })
      })

      const publisherConfig = {
        snsClient,
        sns: { topicArn: config.get('audit.snsTopicArn') },
        application: config.get('audit.application'),
        component: config.get('gitRepositoryName'),
        environment: mapEnvironment(config.get('cdpEnvironment')),
        generateCorrelationId: true
      }

      const sendAuditEvent = makeSendAuditEvent(publisherConfig)
      server.decorate('request', 'sendAuditEvent', function (opts) {
        return sendAuditEvent(this, opts)
      })
      server.decorate('request', 'sendAuditEventInBackground', function (opts) {
        // Fire-and-forget: makeSendAuditEvent catches its own failures, so the
        // dropped promise can never reject. Returns undefined (no thenable).
        sendAuditEvent(this, opts)
      })

      server.ext('onPreResponse', (request, h) => {
        if (isSuccessfulGrantAccess(request)) {
          request.sendAuditEventInBackground({ action: 'start' })
        } else if (isSuccessfulPageNavigation(request)) {
          request.sendAuditEventInBackground({
            action: 'navigate',
            entityid: request.params.path,
            details: { grant: request.params.slug, answers: answersFromPayload(request.payload) }
          })
        } else {
          // Any other request (errors, non-grant routes, intermediate redirects)
          // is deliberately not audited.
        }
        return h.continue
      })
    }
  }
}
