import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { createApiHeadersForGrantsUiBackend } from '../auth/backend-auth-helper.js'
import { debug, log, LogCodes } from '../logging/log.js'
import { mintLockToken } from '../lock/lock-token.js'
import { getGrantCode } from '../grant-code.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

/**
 * Persists a grant submission to the Grants UI backend API.
 *
 * @param {Record<string, unknown>} submission - The submission payload to persist.
 * @param {AnyRequest} request - The Hapi request, used for grant resolution and logging.
 * @returns {Promise<void>} Resolves once the submission has been sent to the backend.
 */
export async function persistSubmissionToApi(submission, request) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return
  }

  const url = new URL('/submissions', GRANTS_UI_BACKEND_ENDPOINT)

  log(
    LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG,
    {
      method: 'POST',
      endpoint: url.href,
      summary: {
        hasReference: Boolean(submission?.referenceNumber),
        keyCount: Object.keys(submission || {}).length
      }
    },
    request
  )

  const grantCode = getGrantCode(request)
  const grantVersion = /** @type {string | number} */ (request.app.model?.def?.metadata?.version ?? 1) // Default to 1 to support non-config broker grants
  const lockToken = mintLockToken({
    userId: /** @type {string} */ (request.auth?.credentials?.contactId),
    sbi: /** @type {string} */ (request.auth?.credentials?.sbi),
    grantCode,
    grantVersion
  })

  try {
    const response = await fetch(url.href, {
      method: 'POST',
      headers: createApiHeadersForGrantsUiBackend({ lockToken }),
      body: JSON.stringify({
        ...submission,
        grantVersion
      })
    })

    if (!response.ok) {
      log(
        LogCodes.SYSTEM.EXTERNAL_API_ERROR,
        {
          method: 'POST',
          endpoint: url.href,
          referenceNumber: submission.referenceNumber,
          errorMessage: `${response.status} - ${response.statusText}`
        },
        request
      )
    }
  } catch (err) {
    debug(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      method: 'POST',
      endpoint: url.href,
      referenceNumber: submission.referenceNumber,
      errorMessage: /** @type {Error} */ (err).message
    })
    // NOSONAR TODO: See TGC-873
    // throw err
  }
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
