import { ApplicationStatus } from '../../constants/application-status.js'
import { getFormsCacheService } from '../forms-cache/forms-cache.js'
import { updateApplicationStatus } from './update-application-status-helper.js'
import { mintLockToken } from '../lock/lock-token.js'
import { getReferenceNumber, getCacheKey, buildSessionKey, setReferenceNumber } from '../state/get-cache-key-helper.js'
import { generateUniqueReference } from '@defra/forms-engine-plugin/engine/referenceNumbers.js'
import { getGrantVersion } from '../grant-version.js'
import { isStoredByReference } from '../state/state-with-definition-context.js'
import { ExternalApiError } from '../../utils/errors/ExternalApiError.js'

/**
 * Persists the new status: CLEARED and REOPENED change the stored state (see
 * {@link persistCleared} / {@link persistReopened}); every other status is a PATCH.
 *
 * @param {AnyFormRequest} request - The Hapi forms request object
 * @param {string} newStatus - The new status to persist
 * @param {string} previousStatus - The previous status for comparison
 * @param {FormSubmissionState} existingState - The existing state to preserve when updating session cache
 * @returns {Promise<void>}
 */
export async function persistStatus(request, newStatus, previousStatus, existingState = {}) {
  if (newStatus === previousStatus) {
    return
  }

  if (newStatus === ApplicationStatus.CLEARED) {
    await persistCleared(request, existingState)
    return
  }

  if (newStatus === ApplicationStatus.REOPENED) {
    await persistReopened(request, existingState)
  }

  const cacheKey = getCacheKey(request)
  const { sbi, grantCode } = cacheKey
  const grantVersion = getGrantVersion(request)
  const contactId = request.auth?.credentials?.contactId || request.auth?.credentials?.crn

  if (!contactId) {
    throw new Error('Missing user identity (contactId/crn) for lock token')
  }

  const lockToken = mintLockToken({
    userId: String(contactId),
    sbi,
    grantCode,
    grantVersion
  })

  await updateApplicationStatus(
    newStatus,
    buildSessionKey(cacheKey),
    /** @type {{ lockToken?: string, grantVersion?: string }} */ ({ lockToken, grantVersion })
  )
}

/**
 * CLEARED (withdrawn). Single-application: reset the document to the bare
 * status, as always. Multi-application: the old ref must not live on (GAS
 * and other services hold records under it), so the document is deleted.
 *
 * @param {AnyFormRequest} request
 * @param {FormSubmissionState} existingState
 */
async function persistCleared(request, existingState) {
  const cacheService = getFormsCacheService(request.server)

  if (!(await isStoredByReference(request))) {
    await cacheService.setState(request, { applicationStatus: ApplicationStatus.CLEARED })
    return
  }

  await cacheService.clearApplicationState(request, storedReferenceNumber(request, existingState))
  setReferenceNumber(request, undefined)
}

/**
 * The ref a ref-keyed document is stored under: on the document, else the request's.
 *
 * @param {AnyFormRequest} request
 * @param {FormSubmissionState} existingState
 * @returns {string}
 */
function storedReferenceNumber(request, existingState) {
  const referenceNumber = existingState.$$__referenceNumber ?? getReferenceNumber(request)

  if (!referenceNumber) {
    throw new Error('Missing reference number for a ref-keyed application')
  }

  return String(referenceNumber)
}

/**
 * REOPENED. Single-application: keep the answers, drop `$$__referenceNumber`
 * so the forms engine mints a new one on the next load. Multi-application:
 * mint it here, save under the new ref, delete the old document and re-scope
 * the request to the new ref.
 *
 * @param {AnyFormRequest} request
 * @param {FormSubmissionState} existingState
 */
async function persistReopened(request, existingState) {
  const cacheService = getFormsCacheService(request.server)
  const reopened = /** @type {FormSubmissionState} */ (
    /** @type {unknown} */ ({
      ...existingState,
      previousReferenceNumber: existingState.$$__referenceNumber,
      applicationStatus: ApplicationStatus.REOPENED
    })
  )
  delete reopened.$$__referenceNumber

  if (!(await isStoredByReference(request))) {
    await cacheService.setState(request, reopened)
    return
  }

  const previousReferenceNumber = storedReferenceNumber(request, existingState)
  const prefix = String(request.app.model?.def?.metadata?.referenceNumberPrefix ?? '')
  const newReferenceNumber = generateUniqueReference(prefix)

  await cacheService.setState(
    request,
    /** @type {FormSubmissionState} */ (
      /** @type {unknown} */ ({ ...reopened, $$__referenceNumber: newReferenceNumber })
    )
  )
  setReferenceNumber(request, newReferenceNumber)

  // Saves only log their failures, so read the new document back before deleting the old one.
  const saved = await cacheService.getState(request)
  if (saved?.$$__referenceNumber !== newReferenceNumber) {
    setReferenceNumber(request, previousReferenceNumber)
    throw new ExternalApiError({
      message: 'Reopened application was not saved; keeping the submitted one',
      source: 'persistReopened',
      reason: 'state_not_persisted'
    })
  }

  try {
    await cacheService.clearApplicationState(request, previousReferenceNumber)
  } catch (err) {
    // Both documents are live: undo the reopen so the business keeps its one submitted application.
    await cacheService.clearApplicationState(request, newReferenceNumber)
    setReferenceNumber(request, previousReferenceNumber)
    throw err
  }
}

/**
 * @import { AnyFormRequest, FormSubmissionState } from '@defra/forms-engine-plugin/engine/types.js'
 */
