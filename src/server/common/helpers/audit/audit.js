import { SNSClient } from '@aws-sdk/client-sns'
import { publishAuditEvent } from '@defra/fcp-audit-publisher'
import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { buildAuditEventForGrantAccess, mapEnvironment } from './audit-event.js'

const HTTP_OK_MIN = 200
const HTTP_REDIRECT_MIN = 300

/**
 * True when the request represents a signed-in user successfully loading a grant
 * page: an authenticated GET to a `/{slug}/...` form route that returned 2xx.
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
    response.statusCode < HTTP_REDIRECT_MIN
  )
}

/**
 * Hapi plugin that publishes one FCP Audit event whenever a signed-in user
 * successfully accesses a grant page. Gated behind `audit.enabled`.
 * @satisfies {import('@hapi/hapi').ServerRegisterPluginObject<void>}
 */
export const auditPublisher = {
  plugin: {
    name: 'audit-publisher',
    register(server) {
      if (!config.get('audit.enabled')) {
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

      server.ext('onPreResponse', (request, h) => {
        if (isSuccessfulGrantAccess(request)) {
          const slug = request.params.slug
          const event = buildAuditEventForGrantAccess(request)

          publishAuditEvent(event, publisherConfig)
            .then(({ messageId }) =>
              log(
                LogCodes.AUDIT.EVENT_PUBLISHED,
                { messageId, entity: 'application', action: 'read', entityid: slug },
                request
              )
            )
            .catch((err) =>
              log(
                { ...LogCodes.AUDIT.EVENT_PUBLISH_FAILED, error: /** @type {Error} */ (err) },
                { entityid: slug, errorMessage: /** @type {Error} */ (err).message },
                request
              )
            )
        }
        return h.continue
      })
    }
  }
}
