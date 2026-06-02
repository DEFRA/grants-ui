import { formsStatusRedirect } from '~/src/server/common/request-pipeline/redirects/forms-status-redirect.js'
import { enforcePagePermission } from './permissions/enforce-page-permission.js'

/**
 * Pipeline handler that enforces page permissions and delegates to forms status callback.
 *
 * If permission enforcement fails, the handler short-circuits and returns the response.
 * Otherwise, it continues to the forms status callback.
 *
 * @async
 * @param {import('./types.js').PipelineRequest} request
 * @param {ResponseToolkit} h
 * @param {FormContext} context - Request-specific context used across the pipeline.
 * @returns {Promise<*>} Hapi response or continuation result.
 */
export async function formsRequestPipeline(request, h, context) {
  const permissionResult = await enforcePagePermission(request, h, context)

  if (permissionResult !== h.continue) {
    return permissionResult
  }

  return formsStatusRedirect(request, h, context)
}

/**
 * @import { ResponseToolkit } from '@hapi/hapi'
 * @import { FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 */
