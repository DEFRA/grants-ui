import { BaseError } from '../../utils/errors/BaseError.js'

/**
 * Extracts the authenticated user's identity values using Grants UI's canonical
 * internal names. SBI is the primary business identifier; `organisationId` is
 * not used as an SBI fallback because the audit schema reserves that name for a
 * customer database primary key.
 *
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @returns {AuthIdentifiers}
 */
export function getAuthIdentifiers(request) {
  const credentials = request.auth?.credentials

  if (!credentials) {
    throw BaseError.wrap(new Error('Missing auth credentials'))
  }

  const sbi = getCredentialString(credentials.sbi)
  const crn = getCredentialString(credentials.crn)
  const contactId = getCredentialString(credentials.contactId)
  const relationshipId = getCredentialString(credentials.relationshipId)
  const organisationName = getCredentialString(credentials.organisationName)

  return {
    sbi,
    crn,
    contactId,
    relationshipId,
    organisationName
  }
}

/**
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @returns {string}
 */
export function getAuthenticatedSbi(request) {
  const { sbi } = getAuthIdentifiers(request)

  if (!sbi) {
    throw BaseError.wrap(new Error('Missing SBI in credentials'))
  }

  return sbi
}

/**
 * @param {import('@defra/forms-engine-plugin/engine/types.js').AnyRequest} request
 * @returns {string}
 */
export function getAuthenticatedCrn(request) {
  const { crn } = getAuthIdentifiers(request)

  if (!crn) {
    throw BaseError.wrap(new Error('Missing CRN in credentials'))
  }

  return crn
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function getCredentialString(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined
  }

  return value
}

/**
 * @typedef {{
 *   sbi?: string,
 *   crn?: string,
 *   contactId?: string,
 *   relationshipId?: string,
 *   organisationName?: string
 * }} AuthIdentifiers
 */
