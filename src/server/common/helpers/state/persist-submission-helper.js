import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { createApiHeaders } from './backend-auth-helper.js'
import { log, LogCodes } from '../logging/log.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

export async function persistSubmissionToApi(submission) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return
  }

  const url = new URL('/submissions', GRANTS_UI_BACKEND_ENDPOINT)

  log(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG, {
    method: 'POST',
    endpoint: url.href,
    summary: {
      hasReference: Boolean(submission?.referenceNumber),
      keyCount: Object.keys(submission || {}).length
    }
  })

  try {
    const response = await fetch(url.href, {
      method: 'POST',
      headers: createApiHeaders(),
      body: JSON.stringify({
        ...submission,
        grantVersion: 1 // TODO: Update when support for same grant versioning is implemented
      })
    })

    if (!response.ok) {
      log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
        method: 'POST',
        endpoint: url.href,
        referenceNumber: submission.referenceNumber,
        error: `${response.status} - ${response.statusText}`
      })
    }
  } catch (err) {
    log(LogCodes.SYSTEM.EXTERNAL_API_ERROR, {
      method: 'POST',
      endpoint: url.href,
      referenceNumber: submission.referenceNumber,
      error: err.message
    })
    // TODO: See TGC-873
    // throw err
  }
}
