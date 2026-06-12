import { formsStatusRedirect } from '~/src/server/common/request-pipeline/redirects/forms-status-redirect.js'
import { enforcePagePermission } from './permissions/enforce-page-permission.js'

/**
 * Pipeline handler that delegates to forms status redirect, then enforces page permissions.
 *
 * If a status redirect is required, the handler short-circuits and returns the redirect.
 * Otherwise, it continues to permission enforcement on the resolved destination page.
 *
 * @async
 * @param {import('./types.js').PipelineRequest} request
 * @param {ResponseToolkit} h
 * @param {FormContext} context - Request-specific context used across the pipeline.
 * @returns {Promise<*>} Hapi response or continuation result.
 */
export async function formsRequestPipeline(request, h, context) {
  const redirectResult = await formsStatusRedirect(request, h, context)

  if (redirectResult !== h.continue) {
    return redirectResult
  }

  return enforcePagePermission(request, h, context)
}

/**
 * @import { ResponseToolkit } from '@hapi/hapi'
 * @import { FormContext } from '@defra/forms-engine-plugin/engine/types.js'
 */
