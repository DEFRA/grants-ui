/**
 * @param {AnyFormRequest | import('@hapi/hapi').Request} request
 * @returns {LandGrantsUserContext}
 */
export function getLandGrantsUserContext(request) {
  return validateLandGrantsUserContext({
    defraIdToken: request.auth?.credentials?.token,
    sbi: request.auth?.credentials?.sbi
  })
}

/**
 * @param {Partial<LandGrantsUserContext> | null | undefined} userContext
 * @returns {LandGrantsUserContext}
 */
export function validateLandGrantsUserContext(userContext) {
  const defraIdToken = userContext?.defraIdToken
  const sbi = userContext?.sbi

  if (typeof defraIdToken !== 'string' || !defraIdToken.trim()) {
    throw new Error('Missing Defra ID token in Land Grants user context')
  }

  if (typeof sbi !== 'string' || !sbi.trim()) {
    throw new Error('Missing SBI in Land Grants user context')
  }

  return { defraIdToken, sbi }
}

/**
 * @typedef {object} LandGrantsUserContext
 * @property {string} defraIdToken
 * @property {string} sbi
 */

/**
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
