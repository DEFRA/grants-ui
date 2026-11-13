import { formsStatusRedirect } from '~/src/server/common/request-pipeline/redirects/forms-status-redirect.js'
import { enforcePagePermission } from './permissions/enforce-page-permission.js'
import { applicationDeletedRedirect } from './redirects/application-deleted-redirect.js'
import { resolveApplicationWindowClosedPath } from './redirects/application-window-closed-redirect.js'
import { applyLocationHints } from '../map/location-hints.js'
import { persistFormatting } from '../helpers/state/persist-formatting.js'
import { enableRepeatTaskContext } from '~/src/server/task-list/repeat-task-context.js'
import { enableRepeatPageItemNames } from '../helpers/repeat-page-item-names.js'
import { enableRepeatNumberFormatting } from '../helpers/repeat-page-number-formatting.js'

/**
 * Pipeline handler that delegates to forms status redirect, then enforces page permissions.
 *
 * If a status redirect is required, the handler short-circuits and returns the redirect.
 * Otherwise, it continues to permission enforcement on the resolved destination page and,
 * when access is allowed, preserves number input precision and adds repeat-page behaviour.
 *
 * @async
 * @param {import('./types.js').PipelineRequest & AnyFormRequest} request
 * @param {ResponseToolkit} h
 * @param {FormContext} context - Request-specific context used across the pipeline.
 * @returns {Promise<*>} Hapi response or continuation result.
 */
export async function formsRequestPipeline(request, h, context) {
  const deletedResult = await applicationDeletedRedirect(request, h, context)

  if (deletedResult !== h.continue) {
    return deletedResult
  }

  const windowClosedPath = resolveApplicationWindowClosedPath(request, context)

  if (windowClosedPath) {
    return h.redirect(windowClosedPath).takeover()
  }

  const redirectResult = await formsStatusRedirect(request, h, context)

  if (redirectResult !== h.continue) {
    return redirectResult
  }

  const permissionResult = await enforcePagePermission(request, h, context)

  if (permissionResult === h.continue) {
    applyLocationHints(request, context)
    persistFormatting(request, context)
    enableRepeatPageItemNames(request)
    enableRepeatNumberFormatting(request)
    enableRepeatTaskContext(request)
  }
  return permissionResult
}

/**
 * @import { ResponseToolkit } from '@hapi/hapi'
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
