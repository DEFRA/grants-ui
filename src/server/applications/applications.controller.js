import { statusCodes } from '../common/constants/status-codes.js'
import { generateUniqueReference } from '@defra/forms-engine-plugin/engine/referenceNumbers.js'
import { getAuthenticatedCrn, getAuthenticatedSbi } from '../common/helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../common/helpers/grant-code.js'
import { listApplicationsFromApi } from '../common/helpers/state/fetch-saved-state-helper.js'
import { setReferenceNumber } from '../common/helpers/state/get-cache-key-helper.js'
import { getStateWithDefinition, resolveVersion } from '../common/helpers/state/state-with-definition-context.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { isApplicationWindowOpen } from '../common/helpers/application-window.js'
import { PermissionError } from '../common/utils/errors/PermissionError.js'

import { buildApplicationsViewModel } from './applications.view-model.js'

/** @param {any} request */
export async function loadDefinition(request) {
  const envelope = await getStateWithDefinition(request)
  setReferenceNumber(request)
  request.app.stateWithDefinition = Promise.resolve(envelope)
  const definition = envelope?.definition?.definition
  if (definition?.metadata?.allowMultipleApplications !== true) {
    throw new PermissionError({
      message: 'Page not found',
      source: 'applicationsRoute',
      reason: 'Multiple applications disabled',
      status: 404
    })
  }
  request.app.model = { def: definition }
  request.app.grantVersion = resolveVersion(envelope)
  return definition
}

/** @satisfies {Partial<ServerRoute>} */
export const listApplicationsController = {
  async handler(/** @type {any} */ request, h) {
    const definition = await loadDefinition(request)
    const crn = getAuthenticatedCrn(request)
    const sbi = getAuthenticatedSbi(request)
    const grantCode = getGrantCode(request)
    const applications = await listApplicationsFromApi({ crn, sbi, grantCode })
    return h.view('applications', buildApplicationsViewModel(request, definition, applications))
  }
}

/** @satisfies {Partial<ServerRoute>} */
export const startApplicationController = {
  async handler(/** @type {any} */ request, h) {
    const definition = await loadDefinition(request)
    if (!isApplicationWindowOpen(request)) {
      return h.redirect(`/${request.params.slug}/application-window-closed`).code(statusCodes.seeOther)
    }
    const reference = generateUniqueReference(/** @type {string} */ (definition.metadata?.referenceNumberPrefix ?? ''))
    await getFormsCacheService(request.server).setState(
      request,
      { $$__referenceNumber: reference },
      { failOnError: true }
    )
    setReferenceNumber(request, reference)
    for (const key of ['visitedSubSections', 'statusChangeRedirect', 'grantApplicationContext']) {
      request.yar.clear(key)
    }
    delete request.app.stateWithDefinition
    return h
      .redirect(
        `/${request.params.slug}${definition.startPage ?? definition.pages[0].path}?ref=${encodeURIComponent(reference)}`
      )
      .code(statusCodes.seeOther)
  }
}

/** @import { ServerRoute } from '@hapi/hapi' */
