import { getEntraIdOptions } from './entra-id-strategy.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * @param {Buffer} buffer
 * @returns {unknown}
 */
function decodeBufferBody(buffer) {
  const text = buffer.toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Boom always genericises `output.payload` for 5xx errors (see @hapi/boom's
 * `output.payload.message = 'An internal server error occurred'`, deliberately
 * hiding detail from the client). The real cause Bell attaches lives on `.data`
 * instead - but for any non-2xx HTTP response, that `.data` is itself a Wreck
 * `Boom` (`Response Error: <status> <statusText>`, see @hapi/wreck's
 * `_shortcut`), with the token endpoint's real status/body nested one level
 * further at `.data.res`/`.data.payload` (an unparsed Buffer). Both levels
 * need unwrapping before logging, or all that's visible is Wreck's generic
 * wrapper message.
 * @param {unknown} data
 * @returns {unknown}
 */
function describeAuthErrorData(data) {
  if (data === null || data === undefined) {
    return null
  }
  if (Buffer.isBuffer(data)) {
    return decodeBufferBody(data)
  }
  const boom =
    /** @type {{ isBoom?: boolean, data?: { isResponseError?: boolean, res?: { statusCode?: number }, payload?: unknown } }} */ (
      data
    )
  if (boom?.isBoom && boom.data?.isResponseError) {
    return {
      upstreamStatusCode: boom.data.res?.statusCode,
      body: describeAuthErrorData(boom.data.payload)
    }
  }
  if (data instanceof Error) {
    return { message: data.message, code: /** @type {NodeJS.ErrnoException} */ (data).code }
  }
  return data
}

export default {
  plugin: {
    name: 'entra-id-auth',
    register: async (server) => {
      const entraIdOptions = await getEntraIdOptions()
      server.auth.strategy('entra-id', 'bell', entraIdOptions)

      server.route({
        method: ['GET', 'POST'],
        path: '/auth',
        options: {
          auth: {
            strategy: 'entra-id',
            mode: 'try'
          },
          handler: (request, h) => {
            if (!request.auth.isAuthenticated) {
              const error = request.auth.error
              log(LogCodes.AUTH.ENTRA_ID_AUTH_FAILURE, {
                errorMessage: error?.message,
                statusCode: error?.output?.statusCode,
                payload: describeAuthErrorData(error?.data)
              })
              return `Authentication failed: ${error.message}`
            }
            return h.response(request.auth.credentials).type('application/json')
          }
        }
      })
    }
  }
}
