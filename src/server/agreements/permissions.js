import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { PermissionError } from '~/src/server/common/utils/errors/PermissionError.js'

/**
 * Requires agreement submission permission before proxying any agreement request.
 * The permissions plugin populates request.can during onPostAuth.
 * @param {Request & { can?: PipelineRequest['can'] }} request
 * @param {ResponseToolkit} h
 * @returns {symbol}
 */
export function enforceAgreementPermission(request, h) {
  if (!request.can?.('submit', 'csAgreements')) {
    throw new PermissionError({
      message: 'Insufficient permissions',
      status: statusCodes.forbidden,
      source: 'enforceAgreementPermission',
      reason: 'insufficient_permissions',
      resource: 'csAgreements',
      permission: 'submit',
      path: request.path,
      userId: request.auth?.credentials?.crn
    })
  }

  return h.continue
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 * @import { PipelineRequest } from '~/src/server/common/request-pipeline/types.js'
 */
