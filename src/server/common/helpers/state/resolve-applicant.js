import { fetchBusinessAndCustomerInformation } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * Returns applicant data from state if present, otherwise fetches it from the
 * Consolidated View API.  Failures are logged and swallowed so that submission
 * is never blocked by a missing applicant record.
 * @param {object} state - Current session state
 * @param {import('@hapi/hapi').Request} request
 * @param {{ grantType: string, referenceNumber: string }} logContext
 * @returns {Promise<object | undefined>}
 */
export async function resolveApplicant(state, request, logContext) {
  const applicant = state.applicant
  if (applicant?.customer || applicant?.business?.name) {
    return applicant
  }

  try {
    return await fetchBusinessAndCustomerInformation(request)
  } catch (error) {
    debug(
      LogCodes.SUBMISSION.SUBMISSION_COMPLETED,
      {
        grantType: logContext.grantType,
        referenceNumber: logContext.referenceNumber,
        errorMessage: `Failed to pre-populate applicant data: ${error.message}`
      },
      request
    )
    return undefined
  }
}
