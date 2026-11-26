import { YarKeys } from '../../constants/session-keys.js'
import { getReferenceNumber } from '../state/get-cache-key-helper.js'

const GRANT_CODE_PATTERN = /^[a-z0-9-]+$/i

/**
 * The grant an agreements proxy request acts on: the grant on a multi-application URL
 * (`?grant=&ref=`), else this business's session context. Shared by the agreements controller
 * and the shutter so both always pick the same grant.
 * @param {AnyRequest} request
 * @returns {string | undefined}
 */
export function agreementGrantCode(request) {
  const storedContext = /** @type {{ grantCode?: string, sbi?: string | number } | null} */ (
    request.yar?.get(YarKeys.GRANT_APPLICATION_CONTEXT)
  )
  if (getReferenceNumber(request)) {
    const grant = request.query?.grant
    return typeof grant === 'string' && GRANT_CODE_PATTERN.test(grant) ? grant : storedContext?.grantCode
  }

  const authenticatedSbi = request.auth?.credentials?.sbi
  if (storedContext?.sbi != null && String(storedContext.sbi) !== String(authenticatedSbi)) {
    return undefined
  }
  return storedContext?.grantCode
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
