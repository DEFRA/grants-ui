import { YarKeys } from '../common/constants/session-keys.js'
import { getRoutingDefinition } from '../common/helpers/definition/routing-definition.js'
import { statusCodes } from '../common/constants/status-codes.js'
import { generateUniqueReference } from '@defra/forms-engine-plugin/engine/referenceNumbers.js'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../common/helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../common/helpers/grant-code.js'
import { listApplicationsFromApi } from '../common/helpers/state/fetch-saved-state-helper.js'
import { setReferenceNumber } from '../common/helpers/state/get-cache-key-helper.js'
import { resolveVersion } from '../common/helpers/state/state-with-definition-context.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { isApplicationWindowOpen } from '../common/helpers/application-window.js'
import { PermissionError } from '../common/utils/errors/PermissionError.js'

import { buildApplicationsViewModel } from './applications.view-model.js'

/** @param {Request} request */
export async function loadDefinition(request) {
  const envelope = await getRoutingDefinition(request)
  setReferenceNumber(request)
  const definition = envelope?.definition?.definition
  if (definition?.metadata?.allowMultipleApplications !== true) {
    throw new PermissionError({
      message: 'Page not found',
      source: 'applicationsRoute',
      reason: 'Multiple applications disabled',
      status: 404
    })
  }
  const app = /** @type {{grantVersion?: string}} */ (request.app)
  app.grantVersion = resolveVersion(envelope)
  return definition
}

export class ApplicationsController {
  /** @param {Request} request @param {ResponseToolkit} h */
  async list(request, h) {
    const definition = await loadDefinition(request)
    const crn = getAuthenticatedCrn(request)
    const sbi = getAuthenticatedSbi(request)
    const grantCode = getGrantCode(request)
    const applications = await listApplicationsFromApi({ crn, sbi, grantCode })
    return h.view('applications', buildApplicationsViewModel(request, definition, applications))
  }

  /** @param {Request} request @param {ResponseToolkit} h */
  async start(request, h) {
    const definition = await loadDefinition(request)
    if (!isApplicationWindowOpen(request, definition)) {
      return h.redirect(`/${request.params.slug}/application-window-closed`).code(statusCodes.seeOther)
    }
    const reference = generateUniqueReference(/** @type {string} */ (definition.metadata?.referenceNumberPrefix ?? ''))
    await getFormsCacheService(request.server).setState(
      request,
      { $$__referenceNumber: reference },
      { failOnError: true, allowMultipleApplications: true }
    )
    setReferenceNumber(request, reference)
    for (const key of [
      YarKeys.VISITED_SUB_SECTIONS,
      YarKeys.STATUS_CHANGE_REDIRECT,
      YarKeys.GRANT_APPLICATION_CONTEXT
    ]) {
      request.yar.clear(key)
    }
    return h.redirect(`/${request.params.slug}?ref=${encodeURIComponent(reference)}`).code(statusCodes.seeOther)
  }
}

/** @import { Request, ResponseToolkit } from '@hapi/hapi' */
