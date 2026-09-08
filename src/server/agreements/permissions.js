import { forbidden } from '@hapi/boom'

/**
 * Requires agreement submission permission before proxying any agreement request.
 * The permissions plugin populates request.can during onPostAuth.
 * @param {Request & { can?: PipelineRequest['can'] }} request
 * @param {ResponseToolkit} h
 * @returns {symbol}
 */
export function enforceAgreementPermission(request, h) {
  if (!request.can?.('submit', 'csAgreements')) {
    throw forbidden('Insufficient permissions')
  }

  return h.continue
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 * @import { PipelineRequest } from '~/src/server/common/request-pipeline/types.js'
 */
